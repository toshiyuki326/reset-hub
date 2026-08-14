# Google Calendar setup

Google CloudでCalendar APIとOAuth consent screenを設定し、Web Clientを作成します。redirect URIは`https://<project>.supabase.co/functions/v1/google-calendar-connect`です。

Supabase Secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`（32 random bytesのBase64）
- `APP_URL`

Staging OAuth Web Clientにはstaging URLだけを登録します。Authorized redirect URIは`https://<STAGING_PROJECT_REF>.supabase.co/functions/v1/google-calendar-connect`と完全一致させ、production URLは追加しません。

Ownerの接続開始時に128bit超のstateとPKCE verifierを生成し、state hashを10分期限でserver側保存します。callbackはAuthorization headerに依存せず、未使用stateを原子的にconsumeします。Refresh TokenはAES-256-GCM暗号化されFrontendへ返りません。失効時はconnectionを`revoked`、Eventを`error`にして再接続／再同期を提示します。同期はreset HUB→Googleだけです。
