/** @vitest-environment jsdom */
import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ConversationMessage} from '../repositories/aiConversationRepository';
import {useProjectAiChatController} from '../components/ai/hooks/useProjectAiChatController';

const mocks=vi.hoisted(()=>({listConversationMessages:vi.fn(),executeProjectAiProposal:vi.fn()}));
vi.mock('../repositories/aiConversationRepository',()=>({listConversationMessages:mocks.listConversationMessages}));
vi.mock('../services/projectAiService',()=>({createProjectAiSession:vi.fn(),sendProjectAiMessage:vi.fn(),executeProjectAiProposal:mocks.executeProjectAiProposal}));

const proposal:ConversationMessage={id:'m',communityId:'c',sessionId:'s',role:'assistant',content:'proposal',proposal:{actions:[{kind:'create_event',target:'event',payload:{title:'test'}}]},proposalStatus:'approved',createdAt:'2026-08-16T00:00:00Z'};
const executed={...proposal,proposalStatus:'executed' as const};
const makeInput=(onExecutionSuccess=vi.fn(async()=>undefined))=>({communityId:'c',profileId:'p',context:{} as never,initialSessions:[{id:'s',communityId:'c',profileId:'p',title:'session',status:'active' as const,createdAt:'now',updatedAt:'now'}],onExecutionSuccess});
const renderController=(refresh:ReturnType<typeof vi.fn>)=>{const input=makeInput(refresh);return renderHook(()=>useProjectAiChatController(input))};

describe('Project AI execution refresh flow',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.listConversationMessages.mockResolvedValue([proposal]);mocks.executeProjectAiProposal.mockResolvedValue([executed])});

  it('refreshes the affected DB-backed slice exactly once after execution succeeds',async()=>{
    const refresh=vi.fn(async()=>undefined);
    const {result}=renderController(refresh);
    await waitFor(()=>expect(result.current.messages).toHaveLength(1));
    await act(async()=>{await result.current.execute('m')});
    expect(mocks.executeProjectAiProposal).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(['events']);
    expect(result.current.messages[0].proposalStatus).toBe('executed');
  });

  it('does not refresh when execution fails',async()=>{
    mocks.executeProjectAiProposal.mockRejectedValueOnce(new Error('failed'));
    const refresh=vi.fn(async()=>undefined);
    const {result}=renderController(refresh);
    await waitFor(()=>expect(result.current.messages).toHaveLength(1));
    await act(async()=>{await result.current.execute('m')});
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.error).toBe('提案を実行できませんでした。');
  });

  it('keeps execution success when the display refresh fails',async()=>{
    const refresh=vi.fn(async()=>{throw new Error('refresh failed')});
    const {result}=renderController(refresh);
    await waitFor(()=>expect(result.current.messages).toHaveLength(1));
    await act(async()=>{await result.current.execute('m')});
    expect(result.current.messages[0].proposalStatus).toBe('executed');
    expect(result.current.status).toBe('idle');
    expect(result.current.notice).toContain('実行は完了しました');
  });

  it('single-flights duplicate execute clicks and avoids a refresh storm',async()=>{
    let release:()=>void=()=>undefined;
    mocks.executeProjectAiProposal.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve([executed])}));
    const refresh=vi.fn(async()=>undefined);
    const {result}=renderController(refresh);
    await waitFor(()=>expect(result.current.messages).toHaveLength(1));
    let first:Promise<void>|undefined;
    let second:Promise<void>|undefined;
    act(()=>{first=result.current.execute('m');second=result.current.execute('m')});
    release();
    await act(async()=>{await Promise.all([first,second])});
    expect(mocks.executeProjectAiProposal).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
