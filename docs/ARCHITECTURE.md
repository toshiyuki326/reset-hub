# Architecture

BrowserはSupabase anon keyとユーザーJWTだけを使用します。`services/data.ts`がTask、Event、Member、LINE Inbox、event_membersをRLS経由で取得・更新します。AuthProviderがMagic Link sessionを復元し、AuthGateが非ログイン・非招待・inactiveユーザーを遮断します。

LINE WebhookとGoogle Edge Functionsだけがservice roleを使用します。LINE変換はPostgres RPC内でTask/Event作成、source参照、Inbox status、activity logを同一transactionにします。Google OAuth stateはserver-only tableへhash、期限、consumed_at付きで保存します。Calendar同期は共通coreを通るcreate/update/deleteで、reset HUBを正本として保ちます。

`VITE_USE_FIXTURES=true`は開発専用かつ明示的です。本番設定不足は起動エラーになり、fixtureへfallbackしません。

## Contract and AI foundation

`src/types/contracts.ts`をTask/Documentの共有contract、`src/types/database.ts`を新規永続化tableのDB型として扱います。Supabase accessはRepository／Serviceに閉じ、Context Builderは入力を受けるpure transformationでDB writeを行いません。

`/project-ai`は認証済みcommunityに限定されたrouteです。`projectContextRepository`が現在のcommunity/profile、Tasks、Goals、KPIs、activityをRLS経由で読み、`projectAiService`が決定的なcontext snapshotを構築します。`aiConversationRepository`は本人所有のsession/messageだけを永続化します。

現schemaに`projects` tableがないため画面はcommunity scopeです。Document永続化modelもないためdocuments入力は明示的に空です。提案レビューは005の`review_ai_proposal` RPCだけを使用します。承認済みproposalの実行は下記Sprint 7のexecutorだけが行い、それ以外にbrowser clientから実行する経路はありません。

`/project-ai`はlazy loadされ、初期Dashboard chunkから分離されます。会話送信は`projectAiService`からJWT付きで`project-ai-chat` Edge Functionへ渡します。FunctionはJWT、active membership、session ownershipを再検証し、bodyからcommunity/profileを受け取りません。Contextをserver-sideで再取得し、OpenAI Responses APIへJSON Schema structured outputを要求した後、Zodで再検証します。message/proposalとusageだけを保存し、Task/Goal/Eventを書き換えません。

## Sprint 7: Approved Proposal Executor

`approved`のproposalのみ、明示的な「実行」操作で`services/projectAiService.ts`の`executeProjectAiProposal`から`execute-ai-proposal` Edge Functionへ`message_id`だけを渡します。Functionはservice roleでJWTからprofileを解決し、`supabase/migrations/202608130006_ai_proposal_execution_foundation.sql`の`execute_ai_proposal(message_id,profile_id)`をひとつのRPC呼び出しとして実行します。claim（`approved→executing`）・`create_task`/`update_task`のTask書き込み・監査記録・`executed`への遷移はすべてこの1回のPL/pgSQL関数=1 transaction内で行われ、途中の例外はPostgresのrollbackで自動的に`approved`へ戻ります。

Edge Function内の`supabase/functions/execute-ai-proposal/`は`schema.ts`（request/safe error code）、`taskExecutor.ts`（Zodによる事前validation）、`executor.ts`（RPC呼び出しとerror code mapping、claim失敗時のみ`mark_ai_proposal_failed`を呼ぶ判定）で構成されます。`create_goal`/`update_goal`/`create_event`はproposalとしてのみ保持され、実行は今後のSprintまで対象外です（`UNSUPPORTED_ACTION`で全体拒否）。
