// 会員ステータスの管理。Google Sheet（CSVエクスポート）を「簡易DB」として使う。
// シートの想定フォーマット（1行目はヘッダーとして無視される）:
//   A列: メールアドレス   B列: ステータス（active / inactive）
//
// メリット: ジョニーさんがコードを触らず、Google Sheet上でステータスを切り替えるだけで
//          支払い滞納者のアクセスを止められる。無料・管理画面不要。
// デメリット: リクエストの都度シートを取得するため、シート側の応答が遅いとページ表示も遅くなる。
//          （MEMBERSHIP_CACHE_MS の間はメモリキャッシュして緩和している）

const SHEET_ID = process.env.MEMBERSHIP_SHEET_ID;
const CACHE_MS = 60 * 1000; // 1分キャッシュ（Edge Middlewareのインスタンスが生きている間のみ有効）

let cache = { at: 0, map: null };

function parseCsvLine(line) {
  // 簡易CSVパーサ（ダブルクォート対応、Google SheetsのCSVエクスポート想定）
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

async function fetchMembershipMap() {
  if (!SHEET_ID) return {};
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
  const res = await fetch(url);
  if (!res.ok) return {};
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const map = {};
  lines.slice(1).forEach((line) => {
    const [emailRaw, statusRaw] = parseCsvLine(line);
    const email = (emailRaw || '').trim().toLowerCase();
    const status = (statusRaw || '').trim().toLowerCase();
    if (email) map[email] = status === 'active';
  });
  return map;
}

// email(小文字化して比較)が有効会員かどうかを返す
export async function isActiveMember(email) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const now = Date.now();
  if (!cache.map || now - cache.at > CACHE_MS) {
    cache = { at: now, map: await fetchMembershipMap() };
  }
  return cache.map[normalized] === true;
}
