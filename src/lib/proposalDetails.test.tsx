// @vitest-environment jsdom
import {render,screen} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {ProposalDetails} from '../components/ai/ProposalDetails';

describe('proposal human review presentation',()=>{
  it('shows action meaning and exact JST time while keeping raw JSON collapsed',()=>{
    render(<ProposalDetails proposal={{title:'タスク提案',summary:'明日の期限です',actions:[{kind:'create_task',target:'task',payload:{title:'イベント内容を確認する',description:null,status:'todo',priority:null,assignee_id:null,due_date:'2026-08-16T03:00:00Z'}}]}}/>);
    expect(screen.getByText('タスクを作成')).toBeTruthy();
    expect(screen.getByText('イベント内容を確認する')).toBeTruthy();
    expect(screen.getByText(/期限:.*12:00.*JST/)).toBeTruthy();
    expect(screen.getByText('技術詳細（JSON）')).toBeTruthy();
    expect(screen.getByText('技術詳細（JSON）').closest('details')?.hasAttribute('open')).toBe(false);
  });
});
