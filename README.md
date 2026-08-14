# reset HUB

resetコミュニティ運営のタスク、イベント、LINE Inbox、メンバーを一元管理するReact/Vite PWAです。Supabaseが本番の正本で、Google Calendarは一方向同期先です。Project AIはserver-side Edge FunctionからOpenAI Responses APIを利用し、提案をレビュー待ちで保存します。人間が明示的に承認し、さらに「実行」を押した`create_task`/`update_task`だけを、別のserver-side Edge Function（`execute-ai-proposal`）が安全に反映します（詳細は`docs/SECURITY.md`）。

## ローカルUI開発（明示的fixture mode）

`.env.development`は`VITE_USE_FIXTURES=true`を明示しています。データはブラウザlocalStorageへ保存されます。

```bash
npm install
npm run dev
```

## Supabase接続モード

```bash
cp .env.example .env.local
# VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を設定
# VITE_USE_FIXTURES=false のまま起動
npm run dev
```

設定不足時に本番モードがfixtureへ暗黙fallbackすることはありません。Migration適用後、Ownerが`community_invitations`へ招待を作成します。Magic Linkの初回ログイン時に一致する未使用・期限内招待だけがProfileとMembershipへ変換されます。

## 検証

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e -- --project=chromium
npm run build
npm audit
supabase test db
```

外部アカウント設定は`docs/LINE_SETUP.md`と`docs/GOOGLE_CALENDAR_SETUP.md`を参照してください。

Staging接続・実行結果は`docs/STAGING_VERIFICATION.md`に記録します。Frontend staging envは`.env.staging.example`を使用し、`npm run staging:preflight`でfixtureとSecret混入を検査できます。

## Project AI Edge Function

FrontendへOpenAIのSecretを設定しないでください。Supabase Edge Functionに必要なSecret名は次のとおりです。

- `OPENAI_API_KEY`（必須、Secret）
- `OPENAI_MODEL`（任意。未設定時は`gpt-4.1-mini`）
- `APP_URL`（既存の許可Origin）

Supabaseが提供する`SUPABASE_URL`と`SUPABASE_SERVICE_ROLE_KEY`はEdge Function内だけで使用します。手動deploy対象は`project-ai-chat`と`execute-ai-proposal`です。`execute-ai-proposal`は追加のSecretを必要としません（`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`APP_URL`のみ）。Secret設定とdeployはaccount ownerが別途行い、このリポジトリやFrontend envへ値を保存しません。
