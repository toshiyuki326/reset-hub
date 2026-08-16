import {describe,expect,it} from 'vitest';
import {dateTimeLabel} from './dates';

describe('date/time contract',()=>{
  it('renders a UTC timestamptz as the intended JST wall clock time',()=>{
    expect(dateTimeLabel('2026-08-16T03:00:00Z')).toContain('12:00');
    expect(dateTimeLabel('2026-08-16T03:00:00Z')).toContain('JST');
  });
  it('keeps explicit offsets equivalent through the browser display boundary',()=>{
    expect(dateTimeLabel('2026-08-16T12:00:00+09:00')).toBe(dateTimeLabel('2026-08-16T03:00:00Z'));
  });
  it('labels missing values without inventing a time',()=>expect(dateTimeLabel()).toBe('未設定'));
});
