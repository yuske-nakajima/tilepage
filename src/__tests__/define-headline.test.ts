// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineHeadlineHorizontal } from '../obstacles/headline';
import { addObstacleHorizontal, addPage, createBook } from '../TilePage';

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
  vi.restoreAllMocks();
});

function makeBook() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const book = createBook({
    container,
    columns: 4,
    observeResize: false,
  });
  addPage(book);
  return book;
}

describe('defineHeadlineHorizontal', () => {
  it('呼び出すと (book, options) => Obstacle の関数を返す', () => {
    const factory = defineHeadlineHorizontal({});
    expect(typeof factory).toBe('function');
  });

  it('生成される element の tagName は H1 固定', () => {
    const book = makeBook();
    const obstacle = defineHeadlineHorizontal({})(book, {
      text: '見出し',
      whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 1 } },
    });
    expect(obstacle.element.tagName).toBe('H1');
  });

  it('text content が options.text を反映する', () => {
    const book = makeBook();
    const obstacle = defineHeadlineHorizontal({})(book, {
      text: '走れメロス',
      whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 1 } },
    });
    expect(obstacle.element.textContent).toBe('走れメロス');
  });

  it('style プロパティが inline style にパススルーされる (全 5 プロパティ)', () => {
    const book = makeBook();
    const obstacle = defineHeadlineHorizontal({
      fontSize: '4em',
      lineHeight: 1.5,
      fontWeight: 700,
      color: 'rgb(10, 20, 30)',
      fontFamily: 'serif',
    })(book, {
      text: 't',
      whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 1 } },
    });
    const s = obstacle.element.style;
    expect(s.fontSize).toBe('4em');
    expect(s.lineHeight).toBe('1.5');
    expect(s.fontWeight).toBe('700');
    expect(s.color).toBe('rgb(10, 20, 30)');
    expect(s.fontFamily).toBe('serif');
  });

  it('未指定の style キーは inline style に書き込まれない (デフォルト押し付けなし)', () => {
    const book = makeBook();
    const obstacle = defineHeadlineHorizontal({})(book, {
      text: 't',
      whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 1 } },
    });
    expect(obstacle.element.style.fontSize).toBe('');
    expect(obstacle.element.style.lineHeight).toBe('');
    expect(obstacle.element.style.fontWeight).toBe('');
    expect(obstacle.element.style.color).toBe('');
    expect(obstacle.element.style.fontFamily).toBe('');
  });

  it('同じ factory を 2 回呼び出すと独立した Obstacle を生成する', () => {
    const book = makeBook();
    const factory = defineHeadlineHorizontal({ fontSize: '2em' });
    const a = factory(book, {
      text: 'A',
      whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 1, lines: 1 } },
    });
    const b = factory(book, {
      text: 'B',
      whenColumns: { 4: { page: 1, at: { col: 2, line: 1 }, cols: 1, lines: 1 } },
    });
    expect(a.element).not.toBe(b.element);
    expect(a.element.textContent).toBe('A');
    expect(b.element.textContent).toBe('B');
  });
});

describe('whenColumns grid collision warn', () => {
  it('同 page / 同 N / 重なる col-line 範囲を 2 つ登録すると console.warn が呼ばれる', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const book = makeBook();

    addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 1 } },
    });
    addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 1 } },
    });

    const collisionWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('衝突'),
    );
    expect(collisionWarns.length).toBeGreaterThan(0);
  });

  it('同 page / 同 N でも col-line 範囲が重ならなければ console.warn は呼ばれない', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const book = makeBook();

    addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 1 } },
    });
    addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: { 4: { page: 1, at: { col: 3, line: 1 }, cols: 2, lines: 1 } },
    });

    const collisionWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('衝突'),
    );
    expect(collisionWarns.length).toBe(0);
  });

  it('別 page なら同じ col-line 範囲でも衝突警告は出ない', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const book = makeBook();
    addPage(book);

    addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: { 4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 1 } },
    });
    addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: { 4: { page: 2, at: { col: 1, line: 1 }, cols: 2, lines: 1 } },
    });

    const collisionWarns = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('衝突'),
    );
    expect(collisionWarns.length).toBe(0);
  });
});
