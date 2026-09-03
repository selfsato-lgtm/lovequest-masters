// GoogleのOAuth同意画面へリダイレクトする。
// クエリ `next` に、ログイン後に戻りたい元のページパスを持たせる（例: /dashboard.html）。

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(500).send('サーバー側の設定が未完了です（GOOGLE_CLIENT_ID未設定）');
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/auth/callback`;

  const next = typeof req.query.next === 'string' && req.query.next.startsWith('/') ? req.query.next : '/dashboard.html';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    prompt: 'select_account',
    state: encodeURIComponent(next),
  });

  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
}
