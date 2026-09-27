// ウォーカープラスの都道府県別イベント一覧(公開ページ)から、今後数か月分の
// 体験イベント・美術展を取得して data/taiken_events.json を更新する。APIキー不要・無料。
// GitHub Actionsの週次ジョブから実行される。robots.txtで許可されている/event_list/のみを取得する。
import { readFile, writeFile } from 'node:fs/promises';

const OUT = 'public/data/taiken_events.json';
const BASE = 'https://www.walkerplus.com';
const MONTHS_AHEAD = 4;      // 今月を含めて何か月先まで
const PAGES_PER_MONTH = 3;   // 1ページ10件 → エリア・カテゴリ・月あたり最大30件
const CATEGORIES = [
  { code: 'eg0120', label: '体験イベント・アクティビティ' },
  { code: 'eg0107', label: '美術展・博物展' },
];
// 全47都道府県対応。コードはウォーカープラスの地域コード(例: 東京都=ar0313)
const AREAS = [
  { code: 'ar0101', pref: '北海道' },
  { code: 'ar0202', pref: '青森県' }, { code: 'ar0203', pref: '岩手県' }, { code: 'ar0204', pref: '宮城県' },
  { code: 'ar0205', pref: '秋田県' }, { code: 'ar0206', pref: '山形県' }, { code: 'ar0207', pref: '福島県' },
  { code: 'ar0308', pref: '茨城県' }, { code: 'ar0309', pref: '栃木県' }, { code: 'ar0310', pref: '群馬県' },
  { code: 'ar0311', pref: '埼玉県' }, { code: 'ar0312', pref: '千葉県' }, { code: 'ar0313', pref: '東京都' },
  { code: 'ar0314', pref: '神奈川県' },
  { code: 'ar0415', pref: '新潟県' }, { code: 'ar0419', pref: '山梨県' }, { code: 'ar0420', pref: '長野県' },
  { code: 'ar0516', pref: '富山県' }, { code: 'ar0517', pref: '石川県' }, { code: 'ar0518', pref: '福井県' },
  { code: 'ar0621', pref: '岐阜県' }, { code: 'ar0622', pref: '静岡県' }, { code: 'ar0623', pref: '愛知県' },
  { code: 'ar0624', pref: '三重県' },
  { code: 'ar0725', pref: '滋賀県' }, { code: 'ar0726', pref: '京都府' }, { code: 'ar0727', pref: '大阪府' },
  { code: 'ar0728', pref: '兵庫県' }, { code: 'ar0729', pref: '奈良県' }, { code: 'ar0730', pref: '和歌山県' },
  { code: 'ar0831', pref: '鳥取県' }, { code: 'ar0832', pref: '島根県' }, { code: 'ar0833', pref: '岡山県' },
  { code: 'ar0834', pref: '広島県' }, { code: 'ar0835', pref: '山口県' },
  { code: 'ar0936', pref: '徳島県' }, { code: 'ar0937', pref: '香川県' }, { code: 'ar0938', pref: '愛媛県' },
  { code: 'ar0939', pref: '高知県' },
  { code: 'ar1040', pref: '福岡県' }, { code: 'ar1041', pref: '佐賀県' }, { code: 'ar1042', pref: '長崎県' },
  { code: 'ar1043', pref: '熊本県' }, { code: 'ar1044', pref: '大分県' }, { code: 'ar1045', pref: '宮崎県' },
  { code: 'ar1046', pref: '鹿児島県' }, { code: 'ar1047', pref: '沖縄県' },
];
const jst = new Date(Date.now() + 9 * 3600 * 1000);
const todayStr = jst.toISOString().slice(0, 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const strip = s => decode(s.replace(/<[^>]+>/g, ' '));

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; lovequest-date-curation/1.0)' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// "2026年7月15日(水)〜2027年5月31日(月)" / "2026年5月29日(金)から" / "2026年9月10日(木)〜11月8日(日)" を解釈
function parsePeriod(text) {
  const ds = [...text.matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g)];
  if (!ds.length || !ds[0][1]) return { start: null, end: null };
  const y0 = +ds[0][1];
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const start = iso(y0, +ds[0][2], +ds[0][3]);
  if (ds.length === 1) return { start, end: /[〜～~]\s*$/.test(text) || /から/.test(text) ? null : start };
  let y1 = ds[1][1] ? +ds[1][1] : y0;
  let end = iso(y1, +ds[1][2], +ds[1][3]);
  if (end < start) end = iso(y1 + 1, +ds[1][2], +ds[1][3]);
  return { start, end };
}

// タイトル・概要のキーワードから、デート向けタグと「誘う時の一言」を機械的に付与
const RULES = [
  [/謎解き|脱出|ミステリー|ミッション/, '謎解き', '二人で協力して解く共有体験。前後にカフェを挟むと安心→刺激→安心の流れに。'],
  [/プラネタリウム|星空/, 'プラネタリウム', '並んで静かに楽しめる鉄板。上映後の感想シェアが会話のきっかけに。'],
  [/イルミネーション|ライトアップ|夜景|ナイト/, '夜', '夕方〜夜の待ち合わせと相性◎。防寒と歩きやすさを一言気遣うと好印象。'],
  [/ワークショップ|体験教室|手作り|陶芸|クラフト/, 'ワークショップ', '一緒に作る時間が会話を生む。トーク力に自信がなくても成立しやすい。'],
  [/水族館/, '水族館', '幻想的な雰囲気で会話が弾みやすい定番デート。ナイト営業があれば夜デートにも。'],
  [/動物園|サファリ/, '動物園', '動物を見ながら自然に会話が生まれる、初対面でも緊張しにくいデート。'],
  [/美術館|博物館|美術展|博物展/, '美術館', '静かに並んで鑑賞でき、感想の語り合いが自然な会話になる王道デート。'],
  [/展|ミュージアム|アート|美術/, '展示', '感想を語り合う価値観トークに発展しやすい。相手の好みを事前に確認して誘う。'],
  [/没入|イマーシブ|VR|デジタルアート|チームラボ/, '没入型', '非日常の刺激パート。終了後は落ち着いた店で余韻を共有すると好意に変換されやすい。'],
  [/マルシェ|フェス|グルメ|フード|食べ/, '食', '食の好みは誘いやすい共通点。気になるお店を「一緒に行きませんか」と乗せて。'],
  [/紅葉|花|桜|バラ|コスモス|自然|公園/, '季節', '季節限定は「今しかない」特別感で誘える。天候の代替案も用意しておくと安心。'],
  [/スタンプラリー|街歩き|周遊/, '街歩き', '歩きながら自然に会話できる。動きやすい服装を事前に伝える気遣いを。'],
];
function enrich(title, summary, tags) {
  const text = title + ' ' + summary;
  const out = new Set(); let tip = '';
  for (const [re, tag, t] of RULES) if (re.test(text)) { out.add(tag); if (!tip) tip = t; }
  return { tags: [...out].slice(0, 3), dateTip: tip || '事前に相手の好みを聞いてから誘うと、共通点づくりになる。' };
}

function parseList(html, prefName) {
  const items = html.split('<li class="m-mainlist__item">').slice(1);
  return items.map(block => {
    const href = (block.match(/<a href="(\/event\/[^"]+)">\s*<span class="m-mainlist-item__ttl">([\s\S]*?)<\/span>/) || []);
    if (!href[1]) return null;
    const periodRaw = strip((block.match(/<p class="m-mainlist-item-event__period">([\s\S]*?)<\/p>/) || [, ''])[1]).replace(/^(開催中|終了間近|もうすぐ開催|開催予定)\s*/, '');
    const summary = strip((block.match(/class="m-mainlist-item__txt"[^>]*>([\s\S]*?)<\/a>/) || [, ''])[1]);
    // 都道府県ページの一覧は maplink が [都道府県名, 市区町村名] の順で入る。都道府県名は area タブ側で別管理するのでここでは除く
    const places = [...block.matchAll(/class="m-mainlist-item__maplink"[^>]*>([\s\S]*?)<\/a>/g)].map(m => strip(m[1])).filter(p => p !== prefName);
    const venue = strip((block.match(/class="m-mainlist-item-event__placelink"[^>]*>([\s\S]*?)<\/a>/) || [, ''])[1]);
    const tagText = [...block.matchAll(/m-mainlist-item__tagsitemlink"[^>]*>([\s\S]*?)<\/a>/g)].map(m => strip(m[1])).join(' ');
    const title = strip(href[2]);
    const { start, end } = parsePeriod(periodRaw);
    const { tags, dateTip } = enrich(title, summary, tagText);
    return {
      id: 'wp-' + href[1].match(/e(\d+)/)?.[1], title,
      area: [places[0], venue].filter(Boolean).join('／') || prefName,
      pref: prefName,
      start, end, summary, tags, dateTip, url: BASE + href[1], source: 'ウォーカープラス',
    };
  }).filter(Boolean);
}

const byId = new Map();
for (const area of AREAS) {
  for (const cat of CATEGORIES) {
    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const d = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + i, 1));
      const m = d.getUTCMonth() + 1;
      for (let p = 1; p <= PAGES_PER_MONTH; p++) {
        // 今月は月別ページが存在しないため、今日の日付(MMDD)の一覧を使う(開催中のイベントが一覧に出る)
        const seg = i === 0 ? todayStr.slice(5).replace('-', '') : String(m);
        const url = `${BASE}/event_list/${seg}/${area.code}/${cat.code}/${p === 1 ? '' : p + '.html'}`;
        try {
          const list = parseList(await get(url), area.pref);
          list.forEach(e => byId.has(e.id) || byId.set(e.id, { ...e, category: cat.label }));
          if (list.length < 10) break;
        } catch (e) { console.error('取得失敗(スキップ):', area.pref, cat.label, e.message); break; }
        await sleep(1200); // 先方サーバーへの負荷を避ける
      }
    }
  }
}

const events = [...byId.values()].filter(e => e.start && !(e.end && e.end < todayStr));
if (events.length < 10) { console.error(`有効なイベントが${events.length}件のみのため更新をスキップ(既存データを保持)`); process.exit(1); }

let note = '';
try { note = JSON.parse(await readFile(OUT, 'utf8')).note || ''; } catch {}
await writeFile(OUT, JSON.stringify({ updatedAt: todayStr, note, events }, null, 2) + '\n');
console.log(`更新完了: ${events.length}件 (${todayStr})`);
