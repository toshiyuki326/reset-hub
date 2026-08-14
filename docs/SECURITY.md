# Security

- active community membershipを全業務テーブルのRLS境界に使用
- Memberは自作／自担当Taskと自作Eventだけ更新、Adminは業務データ、OwnerはMembership・設定を管理
- 招待はJWT email一致、期限内、未使用のみconsume
- LINE raw body HMAC、401、message ID UNIQUE、変換RPCのrow lock
- OAuth state hash、10分期限、single-use、PKCE
- Refresh TokenはAES-GCM、server-only。失効を検知して再接続
- service role、LINE secret、Google client secret、OpenAI API key、refresh tokenはBrowser sourceに存在しない
- React escaping、Zod、DB constraints、監査log

Anon keyは公開可能な識別子ですが、JWTなし／inactive／別communityの行はRLSで取得できません。service roleをFrontend environmentへ設定してはいけません。

Production build後は`npm run security:inspect-build`を実行します。これはserver-only識別子の静的検査であり、実stagingではDevToolsのNetwork、localStorage、sessionStorageもOwnerが目視確認します。

Project AIはEdge Function内でSupabase JWTを検証し、active membershipとsession profile ownershipを確認します。user supplied community IDは受け付けません。OpenAI出力はJSON SchemaとZodの両方で検証し、許可されるproposal kindは`create_task`、`update_task`、`create_goal`、`update_goal`、`create_event`だけです。proposalは保存・レビューのみです。

## Sprint 7: Approved Proposal Executor

`approved`のproposalに限り、ユーザーが明示的に「実行」を押した場合だけ`execute-ai-proposal` Edge Functionが`create_task`/`update_task`をTaskへ反映します。AI応答・承認からの自動実行は行いません（PHASE 13）。

- Edge FunctionはJWTを検証し、`profiles`から自身のprofile_idを解決したうえで`execute_ai_proposal(message_id,profile_id)`をservice role権限で呼び出します。community_id/profile_id/action payloadはbrowserから信用しません。
- `execute_ai_proposal`はSECURITY DEFINERですが、session ownership・active membership・community境界・task権限（owner/adminまたは自作/自担当）をRLSとは独立に関数内で再実装します。
- claim（`approved→executing`）とTaskへの実際の書き込みは同一のPL/pgSQL関数呼び出し=同一transaction内で行われます。途中で例外が起きればPostgresが自動的にrollbackし、行は`approved`へ戻ります（executingのまま取り残されません）。
- 二重実行はrow lock（`select ... for update`）と、`ai_proposal_executions(message_id)`への`status='executing'`部分unique indexの二重の仕組みで防止します。
- 承認後のproposal payload（`proposal`列）はtriggerでUPDATEそのものを拒否します。API未提供に依存せず、DB制約で保証します。
- `execute_ai_proposal`/`mark_ai_proposal_failed`はservice_roleのみに`grant execute`されており、authenticated（browser）から直接呼び出すことはできません。`ai_proposal_executions`もbrowserからのinsert/update/deleteはできません（read onlyでcommunity境界のみ）。
- 内部エラー（Postgresのエラーメッセージ・SQLSTATEの詳細）はEdge Functionの外へ出ません。固定の安全なerror code集合（`NOT_APPROVED`等）だけを返します。
- Browserは`message_id`だけをEdge Functionへ渡します。Task mutationをbrowser側で組み立てることはありません。
