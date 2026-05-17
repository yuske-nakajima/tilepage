// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addFlow, addObstacleHorizontal, addPage, createBook } from '../TilePage';

// addObstacleHorizontal/Vertical 後の再分配経路を検証する。
// observeResize: true なら _reflow controller の request が呼ばれる。
// observeResize: false でも source text が流れていれば同期的に runDistribute される。

class FakeResizeObserver {
  observe(_el: Element): void {}
  unobserve(_el: Element): void {}
  disconnect(): void {}
}

beforeEach(() => {
  document.body.innerHTML = '';
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
  vi.restoreAllMocks();
});

describe('addObstacleHorizontal 再分配経路', () => {
  it('observeResize: false でも source text 投入後の addObstacleHorizontal で同期再分配が走る', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 3,
      writingMode: 'horizontal-tb',
      observeResize: false,
    });
    // page を obstacle で「user 配置」と marker しておく → trimPagesAfter に保持される。
    addPage(book);
    addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: {
        3: { page: 1, at: { col: 1, line: 1 }, cols: 1, lines: 1 },
      },
    });

    // source text を流す。controller は作られない (observeResize: false)。
    addFlow(book, { text: 'abcdefghij' });
    expect(book._reflow).toBeUndefined();
    expect(book.pages.length).toBeGreaterThanOrEqual(1);

    // 各 column の flow-text holder への textContent set 回数を計測する。
    // addObstacleHorizontal 後に再度書き込みが発生すれば再分配の証拠。
    let writeCount = 0;
    const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    if (!desc?.set || !desc.get) throw new Error('Node.prototype.textContent descriptor missing');
    const origSet = desc.set;
    const origGet = desc.get;
    for (const p of book.pages) {
      for (const col of p.columnElements) {
        const holder = col.querySelector<HTMLElement>(':scope > .tilepage-flow-text');
        if (!holder) continue;
        Object.defineProperty(holder, 'textContent', {
          configurable: true,
          get: origGet,
          set(v) {
            writeCount++;
            origSet.call(this, v);
          },
        });
      }
    }
    const writesBefore = writeCount;

    // 別の obstacle を追加 → observeResize:false でも runDistribute が同期で呼ばれる。
    addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: {
        3: { page: 1, at: { col: 2, line: 1 }, cols: 1, lines: 1 },
      },
    });

    expect(writeCount).toBeGreaterThan(writesBefore);
  });

  it('source text が無い addObstacleHorizontal では再分配経路を呼ばない (空の book は壊さない)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 2,
      writingMode: 'horizontal-tb',
      observeResize: false,
    });
    addPage(book);

    expect(book._sourceText).toBe('');
    expect(book._reflow).toBeUndefined();

    expect(() =>
      addObstacleHorizontal(book, {
        shape: 'rect',
        whenColumns: {
          2: { page: 1, at: { col: 1, line: 1 }, cols: 1, lines: 1 },
        },
      }),
    ).not.toThrow();
  });

  it('observeResize: true なら addObstacleHorizontal 後に _reflow.request が呼ばれる', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 2,
      writingMode: 'horizontal-tb',
      observeResize: true,
    });
    addPage(book);
    addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: {
        2: { page: 1, at: { col: 1, line: 1 }, cols: 1, lines: 1 },
      },
    });

    addFlow(book, { text: 'abcdef' });

    const reflow = book._reflow;
    if (!reflow) throw new Error('reflow controller が未初期化');
    const requestSpy = vi.spyOn(reflow, 'request');

    addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: {
        2: { page: 1, at: { col: 2, line: 1 }, cols: 1, lines: 1 },
      },
    });

    expect(requestSpy).toHaveBeenCalled();
  });
});
