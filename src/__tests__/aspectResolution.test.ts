// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _internalAspect, type WhenColumnsVariant } from '../TilePage';

const { parseAspect, resolveLines, FALLBACK_LINES } = _internalAspect;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('parseAspect', () => {
  it('"3/4" → { w: 3, h: 4 }', () => {
    expect(parseAspect('3/4')).toEqual({ w: 3, h: 4 });
  });

  it('"16/9" → { w: 16, h: 9 }', () => {
    expect(parseAspect('16/9')).toEqual({ w: 16, h: 9 });
  });

  it('スペース許容 " 3 / 2 " → { w: 3, h: 2 }', () => {
    expect(parseAspect(' 3 / 2 ')).toEqual({ w: 3, h: 2 });
  });

  it('小数 "1.5/1" を許容', () => {
    expect(parseAspect('1.5/1')).toEqual({ w: 1.5, h: 1 });
  });

  it('空文字 → undefined', () => {
    expect(parseAspect('')).toBeUndefined();
  });

  it('スラッシュなし → undefined', () => {
    expect(parseAspect('169')).toBeUndefined();
  });

  it('片方欠落 → undefined', () => {
    expect(parseAspect('3/')).toBeUndefined();
    expect(parseAspect('/4')).toBeUndefined();
  });

  it('0 を含む → undefined (正の数のみ許可)', () => {
    expect(parseAspect('0/4')).toBeUndefined();
    expect(parseAspect('3/0')).toBeUndefined();
  });

  it('負数は正規表現で弾く', () => {
    expect(parseAspect('-3/4')).toBeUndefined();
  });

  it('文字列混入 → undefined', () => {
    expect(parseAspect('3a/4')).toBeUndefined();
    expect(parseAspect('three/four')).toBeUndefined();
  });
});

describe('resolveLines', () => {
  const baseCtx = {
    columnWidthPx: 100,
    gutterPx: 10,
    lineHeightPx: 20,
  };

  it('aspect 指定あり → cols から lines 導出 (aspect 優先)', () => {
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
      aspect: '3/2',
    };
    // cellWidth = 2*100 + 1*10 = 210, cellHeight = 210 * 2/3 = 140, lines = round(140/20) = 7
    expect(resolveLines(variant, baseCtx)).toBe(7);
  });

  it('aspect と lines 両方指定 → aspect 優先 + warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
      lines: 99,
      aspect: '3/2',
    };
    expect(resolveLines(variant, baseCtx)).toBe(7);
    expect(warn).toHaveBeenCalled();
  });

  it('aspect 未指定 + lines 指定 → そのまま (既存挙動)', () => {
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
      lines: 5,
    };
    expect(resolveLines(variant, baseCtx)).toBe(5);
  });

  it('両方未指定 + imgIntrinsic あり → 画像 natural aspect から導出', () => {
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
    };
    // 1536x1024 = 3:2。 cellWidth=210, cellHeight=140, lines=7
    const ctx = { ...baseCtx, imgIntrinsic: { w: 1536, h: 1024 } };
    expect(resolveLines(variant, ctx)).toBe(7);
  });

  it('両方未指定 + 画像未ロード → FALLBACK_LINES', () => {
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
    };
    expect(resolveLines(variant, baseCtx)).toBe(FALLBACK_LINES);
  });

  it('aspect 不正フォーマット → warn して未指定扱い (画像 natural あれば fallback)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
      aspect: 'invalid',
    };
    const ctx = { ...baseCtx, imgIntrinsic: { w: 3, h: 2 } };
    expect(resolveLines(variant, ctx)).toBe(7); // natural aspect 経路
    expect(warn).toHaveBeenCalled();
  });

  it('aspect 不正 + lines 指定 → warn して lines 採用', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
      lines: 4,
      aspect: 'bad/format/extra',
    };
    expect(resolveLines(variant, baseCtx)).toBe(4);
    expect(warn).toHaveBeenCalled();
  });

  it('cols=1 / 単段でも cellWidth は正の値 (gutter なし)', () => {
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 1,
      aspect: '1/1',
    };
    // cellWidth = 100 (gutter なし), cellHeight = 100, lines = 5
    expect(resolveLines(variant, baseCtx)).toBe(5);
  });

  it('cols=3, aspect=16/9 横長 → lines が少なくなる', () => {
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 3,
      aspect: '16/9',
    };
    // cellWidth = 3*100 + 2*10 = 320, cellHeight = 320 * 9/16 = 180, lines = 9
    expect(resolveLines(variant, baseCtx)).toBe(9);
  });

  it('aspect=1/2 縦長 → lines が多くなる', () => {
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
      aspect: '1/2',
    };
    // cellWidth = 210, cellHeight = 420, lines = 21
    expect(resolveLines(variant, baseCtx)).toBe(21);
  });

  it('lineHeight が 0 → fallback (aspect 経路で計算不能)', () => {
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
      aspect: '3/2',
    };
    const ctx = { ...baseCtx, lineHeightPx: 0 };
    // aspect 経路はスキップされ、 lines/natural なしなので FALLBACK_LINES
    expect(resolveLines(variant, ctx)).toBe(FALLBACK_LINES);
  });

  it('lines が 0 や負数は無視され fallback', () => {
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
      lines: 0,
    };
    expect(resolveLines(variant, baseCtx)).toBe(FALLBACK_LINES);
    const negative: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 2,
      lines: -3,
    };
    expect(resolveLines(negative, baseCtx)).toBe(FALLBACK_LINES);
  });

  it('返り値は常に >= 1 の整数', () => {
    const variant: WhenColumnsVariant = {
      page: 1,
      at: { col: 1, line: 1 },
      cols: 1,
      // 非常に横長 (cellHeight が極端に小さい)
      aspect: '1000/1',
    };
    const result = resolveLines(variant, baseCtx);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(result)).toBe(true);
  });
});
