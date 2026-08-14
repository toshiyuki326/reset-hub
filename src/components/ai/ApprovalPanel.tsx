import {Button} from '../ui';
export function ApprovalPanel({disabled,onApprove,onReject}:{disabled:boolean;onApprove:()=>void;onReject:()=>void}){return <div className="ai-approval"><p>内容を確認し、明示的に判断してください。承認してもブラウザから自動実行はされません。</p><div><Button className="secondary" onClick={onReject} disabled={disabled}>却下</Button><Button onClick={onApprove} disabled={disabled}>承認</Button></div></div>}
