import { describe, expect, it } from 'vitest';
import { parseGridRange } from '../TilePage';

describe('parseGridRange', () => {
  it('単一値は [n, n+1] を返す', () => {
    expect(parseGridRange('2')).toEqual([2, 3]);
  });

  it('範囲指定は [start, end+1] を返す（CSS grid 仕様）', () => {
    expect(parseGridRange('2-4')).toEqual([2, 5]);
  });

  it('start = end も許容する', () => {
    expect(parseGridRange('3-3')).toEqual([3, 4]);
  });

  it('逆順レンジは例外を投げる', () => {
    expect(() => parseGridRange('5-2')).toThrow(/end must be greater/);
  });

  it('0 以下の start は例外を投げる', () => {
    expect(() => parseGridRange('0')).toThrow(/start at 1/);
  });

  it('不正な形式は例外を投げる', () => {
    expect(() => parseGridRange('abc')).toThrow(/invalid grid range/);
    expect(() => parseGridRange('1-2-3')).toThrow(/invalid grid range/);
  });
});
