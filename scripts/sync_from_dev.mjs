// 開発環境(selfsato-lgtm/love-quest)の公開用ファイルを、本番環境(このリポジトリのpublic/)へ同期する。
// 使い方: node scripts/sync_from_dev.mjs <開発環境をcheckoutしたディレクトリ>
//
// 同期するもの:
//   ・トップ階層の *.html (index.htmlと、_v1.0のような旧バージョン退避ファイルを除く)
//   ・index.html … 開発版に、本番専用のログイン表示コード(sync/prod-index/*)を差し込んで生成
//   ・avatar/ assets/ data/ 配下(コピーのみ。開発側で削除されたファイルは本番側に残す)
// 同期しないもの: 提案書・引き継ぎ資料・旧バージョン・lqgame・avatar_bk・scripts等(公開不要なもの)
//
// 安全装置: index.htmlの差し込み位置が見つからない場合は、本番を壊さないよう何も書かずに異常終了する。
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const devDir = process.argv[2];
if (!devDir) { console.error('開発環境のディレクトリを指定してください'); process.exit(1); }
const PUBLIC = 'public';
const changed = [];

const lf = (s) => s.replace(/\r\n/g, '\n');
async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function writeIfChanged(dest, buf) {
  let prev = null;
  try { prev = await readFile(dest); } catch {}
  if (prev && Buffer.compare(prev, buf) === 0) return;
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  changed.push(path.relative(PUBLIC, dest).replace(/\\/g, '/'));
}

async function copyDir(srcDir, destDir) {
  if (!(await exists(srcDir))) return;
  for (const ent of await readdir(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, ent.name), d = path.join(destDir, ent.name);
    if (ent.isDirectory()) await copyDir(s, d);
    else await writeIfChanged(d, await readFile(s));
  }
}

// ── 1) index.html: 開発版 + 本番専用のログイン表示コード ──
async function buildIndex() {
  let html = lf(await readFile(path.join(devDir, 'index.html'), 'utf8'));
  const css = lf(await readFile('sync/prod-index/auth.css', 'utf8'));
  const divs = lf(await readFile('sync/prod-index/auth-divs.html', 'utf8'));
  const js = lf(await readFile('sync/prod-index/auth.js', 'utf8'));

  const count = (re) => (html.match(re) || []).length;
  const checks = [
    ['</style>', count(/<\/style>/g)],
    ['<body>の直後(空行を挟んで)', count(/<body[^>]*>\n[ \t]*\n/g)],
    ['<script>', count(/<script>\n/g)],
  ];
  for (const [name, n] of checks) {
    if (n !== 1) throw new Error(`index.htmlの差し込み位置「${name}」が${n}件見つかりました(期待は1件)。開発版のindex.htmlの構造が変わった可能性があります。sync/prod-index と scripts/sync_from_dev.mjs の見直しが必要です`);
  }
  html = html.replace('</style>', () => css + '</style>');
  html = html.replace(/(<body[^>]*>\n[ \t]*\n)/, (m) => m + divs);
  html = html.replace('<script>\n', () => '<script>\n' + js);
  await writeIfChanged(path.join(PUBLIC, 'index.html'), Buffer.from(html, 'utf8'));
}

// ── 2) 通常のHTMLページ ──
async function syncPages() {
  for (const name of await readdir(devDir)) {
    if (!name.endsWith('.html') || name === 'index.html' || /_v\d/.test(name)) continue;
    await writeIfChanged(path.join(PUBLIC, name), await readFile(path.join(devDir, name)));
  }
}

await buildIndex();
await syncPages();
for (const dir of ['avatar', 'assets', 'data']) await copyDir(path.join(devDir, dir), path.join(PUBLIC, dir));

if (changed.length === 0) { console.log('変更なし'); process.exit(0); }
console.log(`同期した${changed.length}ファイル:\n` + changed.map((f) => '  ' + f).join('\n'));
await writeFile('.sync_changed.txt', changed.join('\n') + '\n');
