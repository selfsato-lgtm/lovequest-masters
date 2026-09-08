// Googleからのリダイレクトを受け取り、認可コードをトークンに交換してメールアドレスを取得。
// 会員リスト（Google Sheet）でステータスを確認し、有効なら署名付きセッションCookieを発行する。

import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from '../../lib/session.js';
import { isActiveMember } from '../../lib/membership.js';

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    res.writeHead(302, { Location: '/index.html?login=cancelled' });
    res.end();
    return;
  }
  if (!code) {
    res.status(400).send('認可コードがありません');
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret) {
    res.status(500).send('サーバー側の設定が未完了です（環境変数未設定）');
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/auth/callback`;

  try {
    // 1. 認可コード → アクセストークン交換
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      res.status(502).send('Googleトークン取得に失敗しました');
      return;
    }
    const tokenData = await tokenRes.json();

    // 2. アクセストークンでユーザー情報（メールアドレス）を取得
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) {
      res.status(502).send('Googleユーザー情報取得に失敗しました');
      return;
    }
    const userInfo = await userRes.json();
    const email = (userInfo.email || '').trim().toLowerCase();
    if (!email || !userInfo.email_verified) {
      res.writeHead(302, { Location: '/index.html?login=failed' });
      res.end();
      return;
    }

    // 3. 会員ステータス確認
    const active = await isActiveMember(email);
    if (!active) {
      res.writeHead(302, { Location: '/index.html?login=inactive' });
      res.end();
      return;
    }

    // 4. セッションCookie発行
    const exp = Date.now() + SESSION_MAX_AGE_MS;
    const token = await createSessionToken({ email, exp }, sessionSecret);
    const maxAgeSec = Math.floor(SESSION_MAX_AGE_MS / 1000);
    res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`);

    let next = '/index.html';
    try {
      const decoded = decodeURIComponent(state || '');
      if (decoded.startsWith('/')) next = decoded;
    } catch (e) { /* stateが不正なら既定値のまま */ }

    res.writeHead(302, { Location: next });
    res.end();
  } catch (e) {
    res.status(500).send('認証処理中にエラーが発生しました: ' + e.message);
  }
}
