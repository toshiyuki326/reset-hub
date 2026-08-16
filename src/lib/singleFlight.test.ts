import {describe,expect,it,vi} from 'vitest';
import {createSingleFlight} from './singleFlight';

describe('single-flight UI guard',()=>{
  it('coalesces simultaneous double clicks for the same proposal',async()=>{let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve});const operation=vi.fn(()=>pending);const once=createSingleFlight();const first=once('execute:m1',operation);const second=once('execute:m1',operation);expect(operation).toHaveBeenCalledTimes(1);release();await Promise.all([first,second])});
  it('allows an explicit retry after the previous operation settles',async()=>{const operation=vi.fn(async()=>{});const once=createSingleFlight();await once('execute:m1',operation);await once('execute:m1',operation);expect(operation).toHaveBeenCalledTimes(2)});
});
