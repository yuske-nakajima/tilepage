// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _findBestFontSize, FIT_MAX_ITERATIONS } from '../obstacles/headline';
import { addHeadlineHorizontal, addPage, createBook } from '../TilePage';

class FakeResizeObserver {
  observe(_el: Element): void {}
  unobserve(_el: Element): void {}
  disconnect(): void {}
}

beforeEach(() => {
  document.body.innerHTML = '';
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('addHeadlineHorizontal: level → <h1>-<h6>', () => {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    it(`level: ${level} で <h${level}> を生成する`, () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const book = createBook({
        container,
        columns: 4,
        writingMode: 'horizontal-tb',
        observeResize: false,
      });
      addPage(book);

      const obstacle = addHeadlineHorizontal(book, {
        level,
        text: 'sample headline',
        whenColumns: {
          4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 2 },
        },
      });

      expect(obstacle.element.tagName).toBe(`H${level}`);
      expect(obstacle.element.textContent).toBe('sample headline');
      expect(obstacle.element.classList.contains('tilepage-headline')).toBe(true);
      expect(obstacle.element.classList.contains('tilepage-obstacle')).toBe(true);
    });
  }

  it('level 範囲外で throw する', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({ container, columns: 4, observeResize: false });
    addPage(book);

    expect(() =>
      addHeadlineHorizontal(book, {
        // @ts-expect-error: 意図的に範囲外
        level: 7,
        text: 'x',
        whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 2 } },
      }),
    ).toThrow(/level must be an integer 1-6/);

    expect(() =>
      addHeadlineHorizontal(book, {
        // @ts-expect-error: 意図的に範囲外
        level: 0,
        text: 'x',
        whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 2 } },
      }),
    ).toThrow(/level must be an integer 1-6/);
  });

  it('whenColumns 未指定で throw する', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({ container, columns: 4, observeResize: false });

    expect(() =>
      addHeadlineHorizontal(book, {
        level: 1,
        text: 'x',
        // @ts-expect-error: 意図的に whenColumns を抜く
      }),
    ).toThrow(/whenColumns is required/);
  });
});

describe('_findBestFontSize: 二分探索の境界値', () => {
  // jsdom は実 layout を持たないため scrollWidth は内容と font-size に応じた近似値を返す。
  // ここでは要素自身に「font-size を増やすほど scrollWidth が増える」 線形モデルを差し替えて、
  // 二分探索が「収まる最大整数 px」 を正しく選ぶか単独で検証する。
  // 振る舞い: ある threshold T (px) に対し、 fontSize <= T なら「収まる」、 超えると「収まらない」 とする。

  function makeMockHeading(threshold: number, maxInlinePx: number): HTMLElement {
    const el = document.createElement('h1');
    document.body.appendChild(el);
    Object.defineProperty(el, 'scrollWidth', {
      configurable: true,
      get(): number {
        const fs = Number.parseFloat(el.style.fontSize) || 16;
        // fontSize == threshold で maxInlinePx と等しい scrollWidth を返す。
        // > threshold で maxInlinePx を超え (収まらない)、 <= threshold で収まる。
        return (fs / threshold) * maxInlinePx;
      },
    });
    return el;
  }

  it('「収まる最大値」 を選ぶ (T=42 で best=42、 43 は収まらない)', () => {
    const maxInline = 100;
    const T = 42;
    const el = makeMockHeading(T, maxInline);
    const best = _findBestFontSize(el, maxInline, { min: 5, max: 200 });
    expect(best).toBe(T);
  });

  it('境界値 best+1 は収まらない (best が「最大」 である証明)', () => {
    const maxInline = 100;
    const T = 42;
    const el = makeMockHeading(T, maxInline);
    const best = _findBestFontSize(el, maxInline, { min: 5, max: 200 });
    // best+1 を直接当てると scrollWidth > maxInline + EPS になることを確認
    el.style.fontSize = `${best + 1}px`;
    expect(el.scrollWidth).toBeGreaterThan(maxInline + 0.5);
    // best 自体は収まる (EPS 込み)
    el.style.fontSize = `${best}px`;
    expect(el.scrollWidth).toBeLessThanOrEqual(maxInline + 0.5);
  });

  it('上端 200 で収まる場合は 200 を返す (T=300 では fontSize=200 でも scrollWidth < maxInline)', () => {
    const maxInline = 100;
    const T = 300;
    const el = makeMockHeading(T, maxInline);
    const best = _findBestFontSize(el, maxInline, { min: 5, max: 200 });
    expect(best).toBe(200);
  });

  it('下端 5 でも収まらない場合は 5 を返す (T=2 では fontSize=5 で既に超過)', () => {
    const maxInline = 100;
    const T = 2;
    const el = makeMockHeading(T, maxInline);
    const best = _findBestFontSize(el, maxInline, { min: 5, max: 200 });
    expect(best).toBe(5);
  });

  it('反復回数が FIT_MAX_ITERATIONS を超えない (無限ループ防止)', () => {
    const maxInline = 100;
    const T = 42;
    let calls = 0;
    const el = document.createElement('h1');
    document.body.appendChild(el);
    Object.defineProperty(el, 'scrollWidth', {
      configurable: true,
      get(): number {
        calls += 1;
        const fs = Number.parseFloat(el.style.fontSize) || 16;
        return (fs / T) * maxInline;
      },
    });
    _findBestFontSize(el, maxInline, { min: 5, max: 200, maxIterations: FIT_MAX_ITERATIONS });
    // 早期 return (lo / hi 端) で 2 回、 ループ本体で最大 FIT_MAX_ITERATIONS 回。 余裕を持って +5。
    expect(calls).toBeLessThanOrEqual(FIT_MAX_ITERATIONS + 5);
  });

  it('FIT_MAX_ITERATIONS が定数として定義されている (公開定数)', () => {
    expect(typeof FIT_MAX_ITERATIONS).toBe('number');
    expect(FIT_MAX_ITERATIONS).toBeGreaterThan(0);
    expect(FIT_MAX_ITERATIONS).toBeLessThanOrEqual(100);
  });
});
