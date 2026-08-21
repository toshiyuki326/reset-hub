# Database

- `202608120001_initial_schema.sql`: v1基本テーブル、enum、index、RLS
- `202608120002_production_hardening.sql`: 招待bootstrap、全テーブルpolicy補完、LINE変換RPC、Event source参照、期限付きOAuth state、Google token status
- `202608130003_fix_owner_bootstrap.sql`: 実stagingで確認されたbootstrap conflict targetの曖昧性をnamed constraintで修正
- `202608130004_project_ai_persistence_foundation.sql`: Goal/KPI、AI conversation/message/usage永続化とRLS、安全なproposal lifecycle
- `202608130005_secure_ai_proposal_review.sql`: message直接更新をauthenticatedから剥奪し、本人所有proposalの承認・却下だけを行うRPCを追加。browser executionは提供しない
- `202608130006_ai_proposal_execution_foundation.sql`: `ai_proposal_status`に`executing`を追加（別transactionで先にcommit）、`execution_id`/`execution_started_at`/`execution_error_code`列とcheck制約、承認後のproposal payloadをtrigger（`protect_approved_ai_proposal`）でUPDATE拒否、`ai_proposal_executions`監査table（`executing`状態はmessage_idにpartial unique indexで多重防止）、`execute_ai_proposal`/`mark_ai_proposal_failed`をservice_role専用RPCとして追加。claimとTask書き込みは同一関数呼び出し=同一transactionで、失敗時は自動的に`approved`へrollbackする
- `202608210010_ai_generation_cost_guards.sql`: AI生成claimをprofile 5回/5分・25回/UTC日、community 20回/5分・100回/UTC日に制限。4 counterを同一service-role-only RPC transaction内のunique key + `ON CONFLICT`で更新し、いずれかの超過時は全incrementをrollbackする。Productionには未適用。

全時刻は`timestamptz`です。`line_message_id`のUNIQUE制約がWebhook再送を冪等化します。`google_oauth_states`にはclient policyがなくservice role限定です。RLS smoke testsは`supabase/tests/rls.sql`、AI proposal lifecycleは`supabase/tests/project_ai_staging.sql`、executor foundationは`supabase/tests/ai_proposal_execution_staging.sql`です（いずれもDocker必須の`supabase test db`用で、本deliverableのbuild環境では未実行）。

RLSの権限ヘルパーは`current_user_community_role(community_id)`です。PostgreSQL組み込みの現在ロール構文と衝突しない明示名を使用します。

```bash
supabase db reset
supabase test db
```
