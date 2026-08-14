# Deployment

1. Supabase migrationを順番に適用します。
2. `line-webhook`、`google-calendar-connect`、`google-calendar-sync`をdeployします。
3. Edge Function Secretsを登録します。
4. FrontendにはSupabase URLとanon keyだけを設定し、`VITE_USE_FIXTURES=false`にします。
5. `npm run build`で生成した`dist/`をHTTPS SPA hostへdeployします。
6. Supabase Auth Site URL／redirect allow-list、Google redirect URI、LINE Webhook URLを本番URLへ合わせます。
7. Owner招待を作成しMagic Link、RLS、LINE再送、Google create/update/delete/retryをstagingで確認します。

Stagingでは`.env.staging.example`を`.env.staging.local`へコピーし、公開可能なSupabase URL/anon keyのみを設定します。`npm run staging:preflight -- .env.staging.local`でfixture無効化とSecret混入を確認してください。実行記録は`docs/STAGING_VERIFICATION.md`へ追記します。
