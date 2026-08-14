import {useState} from 'react';
import type {ConversationMessage} from '../../repositories/aiConversationRepository';
import {Button,Pill} from '../ui';
import {isProposalExecutable,isProposalExecuting} from './projectAiController';

const actionCount = (message: ConversationMessage) => {
  const proposal = message.proposal as {actions?: unknown[]} | undefined;
  return Array.isArray(proposal?.actions) ? proposal.actions.length : 0;
};

export function ExecutionPanel({message, disabled, onExecute}: {message: ConversationMessage; disabled: boolean; onExecute: () => void}) {
  const [confirming, setConfirming] = useState(false);

  if (message.proposalStatus === 'executed') return <Pill tone="green">実行済み</Pill>;
  if (isProposalExecuting(message)) return <p className="ai-note" aria-live="polite"><span className="spinner" /> 実行中...</p>;
  if (message.proposalStatus === 'failed') {
    return (
      <div className="ai-execution-failed">
        <Pill tone="red">実行失敗</Pill>
        <p className="ai-note">自動実行はできませんでした。解決しない場合は管理者が手動でTaskを作成してください。</p>
      </div>
    );
  }
  if (!isProposalExecutable(message)) return null;

  if (!confirming) {
    return <Button onClick={() => setConfirming(true)} disabled={disabled}>実行</Button>;
  }
  return (
    <div className="ai-execution-confirm">
      <p>この提案を実行すると、{actionCount(message)}件のタスクが変更されます。実行しますか？</p>
      <Button className="secondary" onClick={() => setConfirming(false)} disabled={disabled}>キャンセル</Button>
      <Button onClick={() => {setConfirming(false); onExecute();}} disabled={disabled}>実行を確定</Button>
    </div>
  );
}
