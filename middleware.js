// Vercel Edge Middleware: 保護対象ページへのアクセスを、リクエストの時点でブロックする。
// ここを通過しない限りページ本体（HTML/JS）は一切配信されない ＝ URL直打ちでも中身は見えない。

import { verifySessionToken, SESSION_COOKIE_NAME } from './lib/session.js';
import { isActiveMember } from './lib/membership.js';

export const config = {
  matcher: [
    '/dashboard.html',
    '/player_encyclopedia.html',
    '/compatibility_library.html',
    '/impass.html',
    '/aisho.html',
    '/training.html',
    '/type_diagnosis_flowchart.html',
    '/spells_33.html',
    '/ai_johnny.html',
  ],
};

function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const match = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default async function middleware(request) {
  const url = new URL(request.url);
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
