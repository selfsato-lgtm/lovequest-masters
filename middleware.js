// Vercel Edge Middleware: 保護対象ページへのアクセスを、リクエストの時点でブロックする。
// ここを通過しない限りページ本体（HTML/JS）は一切配信されない ＝ URL直打ちでも中身は見えない。

import { verifySessionToken, SESSION_COOKIE_NAME } from './lib/session.js';
import { isActiveMember } from './lib/membership.js';

// デフォルト拒否: index.html(ポータル)以外のHTMLは、全てログイン必須にする。
// 開発環境→本番環境の自動同期(scripts/sync_from_dev.mjs)で新しいページが追加されても、
// 個別にここへ追記しなくても未ログインで見えてしまわないようにするため。
export const config = {
  matcher: '/:path*',
};

function requiresLogin(pathname) {
  const p = pathname.toLowerCase();
  if (!/\.html?$/.test(p)) return false;      // HTML以外(画像・API・JSON等)は対象外
  return p !== '/index.html' && p !== '/index.htm';
}

function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const match = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (!requiresLogin(url.pathname)) return undefined;
  const sessionSecret = process.env.SESSION_SECRET;

  const token = getCookie(request, SESSION_COOKIE_NAME);
  const payload = sessionSecret ? await verifySessionToken(token, sessionSecret) : null;

  if (!payload || (!payload.email && !payload.guest)) {
    const loginUrl = new URL('/api/auth/start', url.origin);
    loginUrl.searchParams.set('next', url.pathname);
    return Response.redirect(loginUrl, 302);
  }

  // ゲストトークンは会員リストに存在しないので、会員チェックはスキップする。
  // トークン自体に24時間の有効期限(exp)が埋め込まれており、verifySessionTokenで既に検証済み。
  if (payload.guest) {
    return undefined;
  }

  // セッションは有効だが、支払い停止などで会員ステータスが無効化されている可能性があるため、
  // 都度（キャッシュはあるが）会員リストを確認する。
  const active = await isActiveMember(payload.email);
  if (!active) {
    const blockedUrl = new URL('/index.html', url.origin);
    blockedUrl.searchParams.set('login', 'inactive');
    return Response.redirect(blockedUrl, 302);
  }

  // 通過（そのままページを配信）
  return undefined;
}
