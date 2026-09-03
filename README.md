# LOVEQUEST MASTERS（会員限定版）

Googleログイン＋会員ステータス（支払い有効/無効）に基づいて、ポータル以外の全ページへの
アクセスをサーバー側（Vercel Edge Middleware）でブロックする構成。URL直打ちでも、
ログイン＋有効会員でない限りページ本体が一切配信されない。

## 構成

```
lovequest-masters/
├── public/              ← 静的ページ本体（index.html=ポータルのみ公開、他は全て保護対象）
├── api/auth/
│   ├── start.js         ← Googleログイン開始（同意画面へリダイレクト）
│   ├── callback.js      ← Googleからのコールバック（トークン交換・会員確認・セッション発行）
│   ├── me.js            ← フロント用：今ログイン中か確認するAPI
│   └── logout.js        ← ログアウト（セッションCookie削除）
├── lib/
│   ├── session.js        ← 署名付きセッションCookieの発行/検証（HMAC-SHA256）
│   └── membership.js     ← 会員ステータス確認（Google SheetをDB代わりに使用）
├── middleware.js          ← 保護対象ページへの全リクエストをここでチェック
└── package.json
```

## 私（Claude）が実装した部分

- Googleログインの一連の流れ（OAuth 2.0の認可コードフロー、外部ライブラリ不使用）
- セッション管理（署名付きCookie、30日間有効）
- 会員ステータスに応じたページアクセス制御（Edge Middlewareで全保護ページに適用）
- ポータル（index.html）へのログイン/ログアウトUI追加

## リョータローさん側で対応が必要な部分（アカウント権限が必要なため）

### 1. Google Cloud で OAuth クライアントを作成

1. https://console.cloud.google.com/ にアクセス（ジョニーさん名義 or 運用アカウントで）
2. 新しいプロジェクトを作成（例: `lovequest-masters`）
3. 「APIとサービス」→「OAuth同意画面」を設定
   - User Type: 外部
   - アプリ名: LOVEQUEST MASTERS、サポートメール等を入力
   - スコープ: `openid`、`.../auth/userinfo.email` を追加
   - テストユーザーを追加するか、公開ステータスにする（本番公開推奨）
4. 「認証情報」→「認証情報を作成」→「OAuthクライアントID」
   - アプリケーションの種類: ウェブアプリケーション
   - 承認済みのリダイレクトURI: `https://lovequest-masters.com/api/auth/callback`
     （Vercelのデフォルトドメインでテストする場合は、そのドメインのURLも追加）
5. 発行された「クライアントID」と「クライアントシークレット」を控えておく

### 2. 会員リスト用の Google Sheet を作成

新しいGoogle Sheetを作成し、以下の形式で入力してください（1行目はヘッダー行として無視されます）。

| A列（メールアドレス） | B列（ステータス） |
|---|---|
| example@gmail.com | active |
| taro@gmail.com | inactive |

- `active` = 閲覧可能、それ以外（`inactive`など） = 閲覧不可
- **共有設定を「リンクを知っている全員が閲覧可」にしてください**（編集可にする必要はありません。サーバー側からCSVとして読み込むだけです）
- シートのURL（`https://docs.google.com/spreadsheets/d/【ここがシートID】/edit`）から、シートIDをコピーしておく
- 支払いが滞った会員は、このシートのB列を`inactive`に変えるだけでアクセスがブロックされます（即時ではなく最大1分程度のキャッシュ遅延あり）

### 3. Vercelプロジェクトを作成してデプロイ

1. このフォルダの中身をGitHubの新しいリポジトリにpush（例: `lovequest-masters`）
2. https://vercel.com/ でこのリポジトリを新規プロジェクトとしてImport
3. プロジェクトの Settings → Environment Variables に以下を設定：
   - `GOOGLE_CLIENT_ID` … 手順1で取得したクライアントID
   - `GOOGLE_CLIENT_SECRET` … 手順1で取得したクライアントシークレット
   - `SESSION_SECRET` … ランダムな長い文字列（32文字以上推奨、パスワード生成ツール等で作成）
   - `MEMBERSHIP_SHEET_ID` … 手順2で控えたシートID
   - `ADMIN_KEY` … ゲストリンク発行ページ用の合言葉（任意の文字列、下記「ゲストログイン機能」参照）
4. デプロイ実行

### 4. 独自ドメイン（lovequest-masters.com）を接続

1. Vercelのプロジェクト → Settings → Domains → `lovequest-masters.com` を追加
2. Vercelが指示するDNSレコード（A/CNAMEレコード）を、ドメイン購入先の管理画面で設定
3. 反映まで数分〜数時間待つ

## ゲストログイン機能（24時間限定アクセス）

会員リストに登録しなくても、**24時間だけ有効なアクセスリンク**を発行できる機能。
Googleログイン不要で、リンクを踏むだけでアクセスできる。

- リンクの発行: `https://lovequest-masters.com/api/auth/guest-generate?key=(ADMIN_KEYの値)` にブラウザでアクセスすると、
  その場で新しい24時間有効なリンクが表示される（ページを開くたびに新しいリンクが発行される）
- 発行されたリンクをゲストに共有すると、そのリンクをクリックするだけでログイン扱いになり、保護ページを閲覧できる
- 24時間経過すると自動的にアクセスできなくなる（延長したい場合は新しいリンクを発行し直す）
- `ADMIN_KEY` を知っている人だけがリンクを発行できるので、他人に知られないよう管理すること

## 動作確認の流れ

1. Vercelのプレビュー用URL（`〜.vercel.app`）でまず一通り確認
   - ログインしていない状態で `/dashboard.html` に直接アクセス → ログイン画面にリダイレクトされるか
   - Googleログイン → 会員リストに`active`で登録したメールでログイン → dashboard.htmlが見られるか
   - 会員リストで`inactive`のメールでログイン → ブロックされ、ポータルに「閲覧が制限されています」と出るか
   - ログアウト → 再度保護ページにアクセスできなくなるか
2. 問題なければ、独自ドメインをこのVercelプロジェクトに向けて本番切り替え
3. 旧GitHub Pages版はそのまま残しておけば、何かあってもすぐ元に戻せます

## 保護対象ページ一覧（`middleware.js`の`matcher`で設定）

`dashboard.html` / `player_encyclopedia.html` / `compatibility_library.html` / `impass.html` /
`aisho.html` / `training.html` / `type_diagnosis_flowchart.html` / `spells_33.html` / `ai_johnny.html`

`index.html`（ポータル）のみ、ログイン不要で誰でも閲覧できます。
