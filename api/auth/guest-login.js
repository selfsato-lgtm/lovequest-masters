// ゲスト用リンク(guest-generateで発行されたトークン)を受け取り、セッションCookieとして確定させる。

import { verifySessionToken, SESSION_COOKIE_NAME } from '../../lib/session.js';

export default async function handler(req, res) {
  const sessionSecret = process.env.SESSION_SECRET;
  const token = req.query.t;
  const payload = sessionSecret ? await verifySessionToken(token, sessionSecret) : null;

  if (!payload || !payload.guest || typeof payload.exp !== 'number') {
    res.writeHead(302, { Location: '/index.html?login=failed' });
    res.end();
    return;
  }

  const maxAgeSec = Math.max(0, Math.floor((payload.exp - Date.now()) / 1000));
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`);
  res.writeHead(302, { Location: '/index.html' });
  res.end();
}
