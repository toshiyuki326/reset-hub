# Sprint 7 — Approved Proposal Executor Foundation: Final Report

New deliverable: `reset-hub-v1-ai-proposal-executor-foundation-20260813`
(sibling of, and independent from, `reset-hub-v1-ai-chat-server-foundation-20260813`)

## 1. Inventory結果

Phase 1で確認した既存資産（推測でschemaを作らず、これらにexecutorを合わせた）:

- `tasks`: `202608120001_initial_schema.sql`。`source_type text check(in ('manual','line','event'))` / `source_id uuid`（無制約）。既存の書き込み経路は `src/services/data.ts` の `createTask`/`patchTask`（browser、RLS経由）と `convert_line_message_to_task` RPC（`202608120002`、SECURITY DEFINERのplpgsql、lock→insert→status更新→activity_logsを同一関数=同一transactionで実行するパターン）。
- `TaskContract`: `src/types/contracts.ts`。`src/types/index.ts` の `Task`/`Status`/`Priority` が実DB列に近い形。`src/lib/validation.ts` の `taskSchema`（Zod）がbrowser側入力検証。
- `activity_logs`: `community_id,actor_id,action,entity_type,entity_id,metadata jsonb`。既存RPCが監査ログとして再利用している汎用table。
- `ai_conversation_messages`（`202608130004`）: `proposal jsonb`、`proposal_status`は`ai_proposal_status` enumで既に`'executed'`/`'failed'`を含んでいた（`'executing'`は無かった＝今回追加）。`check((proposal_status not in ('approved','executed')) or approved_by is not null)`。
- `proposal_status`の遷移: `none→proposal→(review)→approved|rejected`は`review_ai_proposal` RPC（`202608130005`）のみが行い、`revoke update on ai_conversation_messages from authenticated`によりbrowserの直接UPDATEは既に禁止済み。承認は「本人が所有するsession」の`profile_id = v_profile_id`でのみ可能。
- `review_ai_proposal`: 対象行を`for update`でlockし、`proposal_status not in ('proposal','review')`なら拒否。今回のexecutorも同じ「lock→検証→更新」パターンを踏襲。
- `community_members`とRLS: `is_active_member(cid)`/`current_user_community_role(cid)`がSQL helper。`tasks_update`は`owner/admin`または`created_by`本人または`assignee_id`本人のみ許可 — executorの`update_task`権限チェックはこれをSECURITY DEFINER関数内に再実装。
- `project-ai-chat` Edge Function: JWT検証→profile解決→session/community再検証→service role clientでcontext再取得→OpenAI呼び出し→ZodとJSON Schemaの二重検証→`proposal`保存のみでTask/Event等は一切書き換えない。今回のexecutorも同じ認可再検証パターンを流用。

## 2. Threat Model

実装前に [`docs/THREAT_MODEL_SPRINT7.md`](THREAT_MODEL_SPRINT7.md) に全15攻撃経路（doc記載の14項目＋★追加要件A由来の1項目）と対策・実装箇所の対応表を作成済み。要点:

- 二重実行・race conditionは「row lock」と「`ai_proposal_executions(message_id)`へのpartial unique index」の二重の仕組みで防止。
- claim直後のプロセス異常終了は、claimとTask書き込みを**1回のPL/pgSQL関数呼び出し=1 Postgresトランザクション**にすることで「途中で落ちれば自動rollback」に帰着させ、特別な復旧コードを不要にした。

## 3. migration 006の内容

`supabase/migrations/202608130006_ai_proposal_execution_foundation.sql`:

1. `ai_proposal_status`に`'executing'`を追加 — Postgresの制約（同一transaction内で追加した新enum値は直後に使用できない）を避けるため、**独立した`begin;...commit;`で先にcommit**してから以降のDDLで使用。
2. `ai_conversation_messages`に`execution_started_at`/`execution_error_code`/`execution_id`列、`unique(id,community_id)`（監査tableからのFK用）、`execution_id`必須化・`approved_by`必須化・`error_code`整合性のcheck制約3本を追加。
3. `protect_approved_ai_proposal()` trigger関数 + `before update` trigger — `proposal_status`が`proposal`/`review`を離れた行の`proposal`列変更を無条件で拒否（★追加要件B）。
4. `ai_proposal_executions` 監査table（詳細は4節）。
5. `execute_ai_proposal(p_message_id,p_profile_id)` — claim・action検証・Task書き込み・監査・成功時ステータス更新を1関数=1トランザクションで実行（★追加要件A、詳細は7節）。`service_role`のみ`grant execute`。
6. `mark_ai_proposal_failed(p_message_id,p_profile_id,p_error_code)` — 再試行不能なエラーだけをTaskデータに触れず記録する、独立した小さいトランザクション用の別関数。`service_role`のみ`grant execute`。

## 4. Execution State設計（★claimと実行の同一トランザクション設計を含む）

状態は既存の`ai_conversation_messages.proposal_status`列を延長: `approved → executing → executed | failed`。

`execute_ai_proposal`内の擬似コード（実装は同ファイル参照）:

```
BEGIN（＝1回のRPC呼び出しがそのまま1トランザクション）
  select ... for update            -- 行lock兼claim起点
  session所有者チェック / active member再検証
  proposal_status='approved' 以外は例外（すでにNOT_APPROVED/ALREADY_EXECUTING/ALREADY_EXECUTED）
  actions[] の kind allowlist検証（create_task/update_task以外は例外）
  update ... set proposal_status='executing', execution_id=...   -- claim
  insert into ai_proposal_executions(...,'executing')
  各actionをループ: create_task / update_task を実DBへ反映
  update ... set proposal_status='executed'
  update ai_proposal_executions set status='executed'
  insert into activity_logs(...)
  RETURN
COMMIT（例外なし時）
```

途中で例外が発生した場合はPostgresが自動的に全体をROLLBACKし、`proposal_status`はclaim前の`'approved'`に戻る。追加の復旧コードは不要（この設計そのものが★追加要件Aの実装）。

失敗理由を恒久的に記録する必要がある場合だけ、Edge Function側が**別のRPC呼び出し**として`mark_ai_proposal_failed`を呼ぶ（＝別トランザクション、Taskデータには触れない）。

## 5. Audit設計

新規専用table `ai_proposal_executions`（既存`activity_logs`は汎用ログとして成功時のみ併用）:

`execution_id`(idempotency key, unique) / `community_id` / `message_id` / `session_id` / `executor_profile_id` / `approved_by` / `action_count` / `action_kinds text[]` / `status` / `safe_error_code` / `before_snapshot jsonb` / `after_snapshot jsonb` / `started_at` / `completed_at`。

- `create unique index ... (message_id) where status='executing'` — 同一proposalへの同時2件の`executing`行をDBレベルで禁止（二重実行防止の2つ目の独立した仕組み）。
- RLSは`is_active_member(community_id)`でSELECTのみ許可。INSERT/UPDATE/DELETEのpolicyは存在せず、`revoke all from authenticated,anon`で二重に塞いでいる（browserからの直接書き込み不可）。
- Secret/PIIは保存しない。`before_snapshot`/`after_snapshot`はTaskのstatus/priority/assignee_id/due_date程度の最小限。

## 6. Executor Architecture

```
Browser (message_id のみ送信)
  → services/projectAiService.ts: executeProjectAiProposal(sessionId, messageId)
    → supabase.functions.invoke('execute-ai-proposal', {body:{message_id}})
      → supabase/functions/execute-ai-proposal/index.ts
        JWT検証 → profiles解決 → executor.ts
          → community_members/session再取得・所有権/active再検証
          → taskExecutor.ts の Zodで actions[] 事前検証（早期reject、DBラウンドトリップ節約）
          → admin.rpc('execute_ai_proposal', {p_message_id, p_profile_id})   ← 認可・整合性の一次情報源はここ
          → 失敗時のみ条件付きで admin.rpc('mark_ai_proposal_failed', ...)
      ← {message: 更新後の行} または 安全なerror code
    ← conversations.listConversationMessages(sessionId) を再取得して返す（project-ai-chatと同じ流儀）
  ← ExecutionPanel.tsx が proposalStatus に応じて 実行/実行中/実行済み/実行失敗 を表示
```

file構成: `supabase/functions/execute-ai-proposal/{index.ts,schema.ts,executor.ts,taskExecutor.ts,*_test.ts}`（指示書のPhase 5構成に一致）。

## 7. Atomic Claim方式

`select ... for update`による行lockと、`proposal_status='approved'`の事前条件を同一トランザクション内で行うことで、2件目の同時requestは同じ行lockを取得するまでblockされ、1件目のcommit/rollback後の最終状態（`executing`中/`executed`済み/元の`approved`）を見て`ALREADY_EXECUTING`/`ALREADY_EXECUTED`/やり直し可、のいずれかに分岐する。加えて`ai_proposal_executions(message_id) where status='executing'`のpartial unique indexが、万一row lockの経路を経由しない書き込みが将来追加されても二重の`executing`状態を許さない、独立した第二の防御になっている。

## 8. Proposal Integrity（★DB制約によるUPDATE拒否の実装内容を含む）

`protect_approved_ai_proposal()` trigger（`before update on ai_conversation_messages`）:

```sql
if old.proposal_status not in ('proposal','review') and new.proposal is distinct from old.proposal then
  raise exception ... using errcode='AI011';
end if;
```

`review_ai_proposal`/`execute_ai_proposal`/`mark_ai_proposal_failed`はいずれも`proposal`列自体を変更しないため影響を受けない。この trigger は呼び出し元のrole（authenticated / service_role / postgres superuser）に関係なく発火するため、「UPDATE APIをアプリ側に用意しない」ことに依存しない、DBレベルの保証になっている。よりcomplexなdigest/hash方式は、この trigger で十分にimmutability を保証できるため見送った。

## 9. create_task Executor

Allowlist（AIが指定できるfield）: `title`（必須・160文字まで）/ `description` / `status` / `priority` / `assignee_id`（同一community内のcommunity_membersであることを検証）/ `due_date`。`community_id`/`created_by`/内部IDはすべてserver-side（`v_message.community_id`/`v_message.approved_by`）から決定し、AI提案のpayloadから受け取らない。`source_type`は既存の`'manual'`をそのまま使用（既存CHECK制約を変更するリスクを避け、由来は`ai_proposal_executions.message_id`と`activity_logs`で追跡）。

## 10. update_task Executor

対象Taskをserver-sideで`for update`取得し、順に検証: 存在するか（`TARGET_NOT_FOUND`）→同一communityか（`COMMUNITY_MISMATCH`）→権限（`owner/admin`または`created_by`本人または`assignee_id`本人、既存`tasks_update` RLSと同じ規則を関数内に再実装、`PERMISSION_DENIED`）→payload allowlistに従っているか。`id`/`community_id`/`created_by`はUPDATE文のSET句に一切含まれず、immutableであることをvitestの構造テストでも検証済み。

## 11. Multi-action Transaction

`actions[]`をまず全件走査してkindを検証し、`create_task`/`update_task`以外が1件でもあれば**書き込みを一切行わずに**`UNSUPPORTED_ACTION`で全体を拒否する。実際の書き込みも同じ1トランザクション内のループで行うため、途中の1 actionが失敗すればそれ以前に成功していたactionの書き込みも含めて全てロールバックされる（部分実行は起こり得ない）。

## 12. Authorization

承認できる人 = `review_ai_proposal`が要求する「session所有者かつactive member」（既存のまま、Sprint 7で変更なし）。
実行できる人 = 同じく「session所有者かつactive member」（`execute_ai_proposal`が同一の条件を独立に再実装）。
最低限の拒否: inactive→`INACTIVE_MEMBER`、無関係community→`COMMUNITY_MISMATCH`、無関係session→`PERMISSION_DENIED`。service role（RLSを迂回する経路）でも、これらの認可判定はSQL関数内に明示的に再実装されており、「service roleだから」を理由に省略している箇所はない。

## 13. Frontend Flow

`ExecutionPanel.tsx`が`proposalStatus`に応じて表示を切替: `approved`→「実行」ボタン→クリックで確認文言（「この提案を実行すると、N件のタスクが変更されます。実行しますか？」）→確定で`execute`呼び出し。`executing`→スピナー付き「実行中...」。`executed`→Pill「実行済み」。`failed`→Pill「実行失敗」＋管理者による手動Task作成を促す文言。自動retryボタンは実装していない（`approved`に戻ったケースはUI上「実行」ボタンが再度出るだけで足り、`failed`は意図的に手動運用へ誘導）。

## 14. Error Handling

安全なerror code一覧（`schema.ts`の`safeErrorCodes`）: `AUTHENTICATION_ERROR`/`INVALID_REQUEST`/`NOT_APPROVED`/`ALREADY_EXECUTING`/`ALREADY_EXECUTED`/`UNSUPPORTED_ACTION`/`INVALID_ACTION`/`TARGET_NOT_FOUND`/`COMMUNITY_MISMATCH`/`PERMISSION_DENIED`/`INACTIVE_MEMBER`/`EXECUTION_FAILED`。SQL側は`AI001`〜`AI009`のカスタムSQLSTATEで例外を上げ、`executor.ts`の`mapRpcError`が変換。未知のSQLSTATE（実DBの制約違反等）は自動的に`EXECUTION_FAILED`にfallbackし、Postgresの生エラーテキストは一切browserへ返さない。UI表示は統一メッセージ「提案を実行できませんでした。」。

## 15. Tests結果

3層で検証:

- **Deno（実行済み・全pass）**: `deno test --node-modules-dir=none --allow-env --allow-net supabase/functions/` → **31 passed | 0 failed**（`execute-ai-proposal`分は25件、うち`executor_concurrency_test.ts`は`Promise.all`による本物の並行呼び出しをPostgresの行lock挙動を忠実に模したmockに対して25試行実行し、常に「1件成功・1件がALREADY_EXECUTING/ALREADY_EXECUTED」であることを検証）。
- **vitest（実行済み・全pass）**: `npm test` → **83 passed (15 files)**。うち新規`aiProposalExecutionSecurity.test.ts`(21件)がmigration 006とexecute-ai-proposal function、frontendの結線を構造的に検証。既存の`aiProposalSecurity.test.ts`は「browserは実行できない」という古い前提を「実行はexecute-ai-proposal Edge Function経由のみで、直接のtable/RPC書き込みは無い」という現行の前提に更新。`projectAiController.test.ts`も同様に更新。
- **pgTAP（作成済み・未実行）**: `supabase/tests/ai_proposal_execution_staging.sql`（22 assertions）。claimロールバック、二重実行防止（row lockとpartial unique indexの両方）、immutability trigger、cross-community拒否、service_role限定grant、`mark_ai_proposal_failed`を含む実Postgresでの検証を用意したが、**本環境にDockerが無く`supabase test db`を実行できなかった**（Sprint 4/5時点の`docs/IMPLEMENTATION_NOTES.md`と同じ制約）。Docker環境で`supabase test db`を実行して結果を確認することを残課題とする。

回帰確認: 既存の`bootstrap-regression.test.ts`/`membership-contract.test.ts`/`rls-policy.test.ts`/`persistence-foundation.test.ts`/`projectAiEdge.test.ts`/`contractsBuilder`関連/`security.test.ts`等はすべて無変更のまま**全件pass**（Owner bootstrap・Dashboard・Project AI chatの回帰なし）。

## 16. ESLint結果

`npm run lint` → **エラー0件**（`supabase/functions`はeslint.config.jsで元々ignore対象）。

## 17. TypeScript結果

`npm run typecheck`（`tsc -b --pretty false`）→ **エラー0件**。

## 18. Deno check/test結果

`deno check`（`--node-modules-dir=none`、全5 Edge Function）→ **全てCheck成功**。
`deno test`（同フラグ＋`--allow-env --allow-net`、全Edge Function）→ **31 passed | 0 failed**。

## 19. build結果

`npm run build`（`tsc -b && vite build`）→ **成功**。既存のchunk sizeに関する情報warning（500kB超）のみで、これはSprint 7以前から存在する既知の事項（本Sprintのスコープ外）。

## 20. Security Inspection結果

- `npm run security:inspect-build` → **PASS**（`dist`内にservice role key・OpenAI key等のserver-only識別子なし）。
- `grep`による`src/`直接検査でも`SUPABASE_SERVICE_ROLE_KEY`/`OPENAI_API_KEY`は存在せず、`supabase/functions/*`（server-side）にのみ存在することを確認。
- Phase 16チェックリスト（browserからのSQL mutation不可・proposal state直接mutation不可・JWT再検証・active membership再検証・ownership再検証・community boundary再検証・action allowlist機能・payload validation機能・audit記録・atomic実行）はすべて migration 006 の`revoke`/`grant`/RLS policyおよび`executor.ts`/`taskExecutor.ts`のコードで実装し、`aiProposalExecutionSecurity.test.ts`で構造的に検証済み。

## 21. 新規/変更ファイル一覧

**新規**
- `supabase/migrations/202608130006_ai_proposal_execution_foundation.sql`
- `supabase/functions/execute-ai-proposal/{index.ts,schema.ts,executor.ts,taskExecutor.ts,executor_test.ts,executor_concurrency_test.ts,taskExecutor_test.ts}`
- `supabase/tests/ai_proposal_execution_staging.sql`
- `src/components/ai/ExecutionPanel.tsx`
- `src/lib/aiProposalExecutionSecurity.test.ts`
- `docs/THREAT_MODEL_SPRINT7.md`, `docs/FINAL_REPORT_SPRINT7.md`（本ファイル）

**変更**
- `src/components/ai/{MultiActionPanel.tsx,ProjectAiChat.tsx,ProposalPanel.tsx,projectAiController.ts,hooks/useProjectAiChatController.ts}`
- `src/services/projectAiService.ts`（`executeProjectAiProposal`追加）
- `src/repositories/aiConversationRepository.ts`（`proposalStatus`に`'executing'`、`executionErrorCode`追加）
- `src/types/database.ts`（`ai_conversation_messages`の実行列、`ai_proposal_executions`型追加）
- `src/styles.css`（`.ai-execution-confirm`/`.ai-execution-failed`）
- `src/lib/aiProposalSecurity.test.ts`, `src/lib/projectAiController.test.ts`（Sprint 7の実行経路に合わせて更新、意図的な変更）
- `docs/{DATABASE.md,SECURITY.md,ARCHITECTURE.md,IMPLEMENTATION_NOTES.md}`, `README.md`
- `deno.lock`（`deno check`/`deno test`実行に伴う自動更新）

## 22. migration追加有無

あり。`202608130006_ai_proposal_execution_foundation.sql`（Local deliverableのみ、remoteには未反映）。

## 23. deploy対象のEdge Function名

`execute-ai-proposal`（新規）。既存の`project-ai-chat`は無変更のため再deploy不要（ただし運用上は最新版を揃えて構わない）。

## 24. staging反映前に必要な手順

1. `supabase link`後、`supabase db push`でmigration 001〜006を反映（本Sprintでは未実行・禁止事項どおり）。
2. Docker環境で`supabase test db`を実行し、`supabase/tests/ai_proposal_execution_staging.sql`を含む全pgTAPが通ることを確認（本環境では未実施）。
3. `supabase functions deploy execute-ai-proposal`。追加のSecretは不要（`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`APP_URL`は既存のまま）。
4. staging上のcommunityで、実際に「提案作成→承認→実行」を1件通しで確認（`create_task`と`update_task`それぞれ）。
5. `docs/STAGING_VERIFICATION.md`へ結果を追記。

## 25. 新deliverable絶対パス

```
/Users/sakamototoshiyuki/Documents/Codex/2026-08-12/files-mentioned-by-the-user-reset/outputs/reset-hub-v1-ai-proposal-executor-foundation-20260813
```

（指示書の例示名`reset-hub-v1-ai-task-executor-foundation-20260813`は、既にCodexによる旧実装が同名で存在していたため、混同を避けて別名にした。`.env.development.local`等のSecretはコピーしていない。`node_modules`と`*.tsbuildinfo`は検証後に削除済み — `npm install`で再生成可能。）

## 26. 残課題

- `supabase/tests/ai_proposal_execution_staging.sql`をDocker環境で実際に実行し、pgTAP 22 assertionsが全通過することの確認（本環境の制約で未実施）。
- 本物の同時HTTPリクエストによるEdge Function経由のend-to-end並行実行テスト（ローカルSupabaseスタックが必要）。
- `execute-ai-proposal`のstaging deploy後、実運用のcommunityでの動作確認。
- `mark_ai_proposal_failed`のTS層(`executor.ts`)からの呼び出しは網羅的にDenoテストしたが、SQL関数自体の単体pgTAPカバレッジはstaging_execution.sqlの3 assertionsに留まる（より広いエラーコードでの追加検証は次Sprint以降でも可）。

## 27. 次Sprint案

指示書どおり、同じExecutor基盤（atomic claim・immutability trigger・audit table・safe error codeの枠組み）を再利用して`create_goal`/`update_goal`を追加し、その後`create_event`へ拡張する。LINE送信・Google Calendar書き込みは別の承認境界として扱う。
