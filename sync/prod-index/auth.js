// ─── ログイン状態の表示 ───
(async () => {
  const params = new URLSearchParams(location.search);
  const banner = document.getElementById('authBanner');
  const bannerMessages = {
    inactive: 'このアカウントは現在、閲覧が制限されています。お支払い状況をご確認のうえ、ジョニーさんまでご連絡ください。',
    failed: 'ログインに失敗しました。もう一度お試しください。',
    cancelled: 'ログインがキャンセルされました。',
  };
  const loginParam = params.get('login');
  if(loginParam && bannerMessages[loginParam]){
    banner.textContent = bannerMessages[loginParam];
    banner.style.display = 'block';
  }

  const accountBar = document.getElementById('accountBar');
  try{
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if(data.loggedIn){
      accountBar.innerHTML = `<span>${data.email}</span><a href="/api/auth/logout">ログアウト</a>`;
    } else if(!loginParam){
      // 未ログインなら自動的にGoogleログイン画面へ(ログイン失敗/制限バナー表示中は自動遷移させない)
      location.href = '/api/auth/start';
    } else {
      accountBar.innerHTML = `<a href="/api/auth/start">🔐 Googleでログイン</a>`;
    }
  }catch(e){
    accountBar.innerHTML = `<a href="/api/auth/start">🔐 Googleでログイン</a>`;
  }
})();

