// 管理者(ジョニーさん/リョータロー)が、24時間だけ有効なゲスト用ログインリンクを発行するページ。
// URLに ?key=(ADMIN_KEY) を付けてアクセスすると、共有用リンクが表示される。

import { createSessionToken } from '../../lib/session.js';

const GUEST_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24時間

export default async function handler(req, res) {
  const adminKey = process.env.ADMIN_KEY;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!adminKey || !sessionSecret) {
    res.status(500).send('サーバー側の設定が未完了です（ADMIN_KEY または SESSION_SECRET 未設定）');
    return;
  }
  if (req.query.key !== adminKey) {
    res.status(403).send('アクセスできません（keyが正しくありません）');
    return;
  }

  const exp = Date.now() + GUEST_MAX_AGE_MS;
  const token = await createSessionToken({ guest: true, exp }, sessionSecret);

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const link = `${proto}://${host}/api/auth/guest-login?t=${encodeURIComponent(token)}`;
  const expiresAt = new Date(exp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>ゲストリンク発行</title></head>
<body style="font-family:'Hiragino Sans','Yu Gothic',sans-serif;max-width:640px;margin:60px auto;line-height:1.8;padding:0 16px">
  <h2>🎫 ゲスト用ログインリンクを発行しました</h2>
  <p>このリンクは <b>${expiresAt}（発行から24時間）</b> まで有効です。ゲストにこのURLを共有してください。<br>
  1つのリンクは何度でもクリックできますが、有効期限が過ぎると自動的にアクセスできなくなります。</p>
  <p style="word-break:break-all;background:#f0f0f0;padding:12px;border-radius:8px;">
    <a href="${link}">${link}</a>
  </p>
  <p style="color:#888;font-size:13px">新しいリンクが欲しい場合は、このページをもう一度開いてください（毎回、新しい24時間有効なリンクが発行されます）。</p>
</body></html>`);
}
