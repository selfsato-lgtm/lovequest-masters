import { SESSION_COOKIE_NAME } from '../../lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  res.writeHead(302, { Location: '/index.html?logout=1' });
  res.end();
}
