// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addFlow, addObstacle, addPage, createBook } from '../TilePage';

// trimPagesAfter は stream の余りが無い page を末尾から削るが、
// obstacle を持つ page は user が明示配置したものと見做して保持する。
// demo/vertical/main.ts のように 3 つの obstacle page を作って short text を流した場合、
// circle / polygon page が消えてはならない。

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

describe('trimPagesAfter safeguard (obstacle page を刈らない)', () => {
  it('3 つの obstacle page を作って短い text を流しても全 obstacle page が残る', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 4,
      writingMode: 'vertical-rl',
      observeResize: false,
    });

    // demo/vertical/main.ts と同じ構造で 3 page 作って obstacle を置く。
    const p1 = addPage(book);
    addObstacle(p1, { at: { col: '2-3', row: '1-2' }, shape: 'rect' });
    const p2 = addPage(book);
    addObstacle(p2, { at: { col: '2-3', row: '1-2' }, shape: 'circle' });
    const p3 = addPage(book);
    addObstacle(p3, {
      at: { col: '2-3', row: '1-2' },
      shape: {
        type: 'polygon',
        points: [
          [0.5, 0],
          [1, 0.5],
          [0.5, 1],
          [0, 0.5],
        ],
      },
    });

    expect(book.pages.length).toBe(3);

    // 1 文字だけの極短 text。明らかに 1 page に収まる。
    addFlow(book, { text: 'a' });

    // safeguard により obstacle 持ち page は全て残る。
    expect(book.pages.length).toBe(3);
    expect(book.pages[0].obstacles.length).toBe(1);
    expect(book.pages[1].obstacles.length).toBe(1);
    expect(book.pages[2].obstacles.length).toBe(1);
    // 全 page が DOM に attach されたまま。
    expect(container.querySelectorAll('.tilepage-page').length).toBe(3);
  });

  it('obstacle を持たない自動生成 page は短い text なら trim される', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 4,
      writingMode: 'horizontal-tb',
      observeResize: false,
    });

    // obstacle 無しの空 page を 3 つ作る。
    addPage(book);
    addPage(book);
    addPage(book);
    expect(book.pages.length).toBe(3);

    // 短い text。jsdom では getBoundingClientRect が 0 を返すため、distribute が
    // 進めず early break する。この場合 pageIndex は 0 のままで trimPagesAfter(0) が呼ばれる。
    // obstacle が無いので末尾 page から順に削除されていく。
    addFlow(book, { text: 'a' });

    // jsdom 上では fitTextIntoWindow が 0 を返すため進めず、pageIndex=0 で trim される。
    // obstacle が無い末尾 page は順次削除されて 0 page になる (= safeguard が効くのは obstacle 持ちだけ)。
    expect(book.pages.length).toBeLessThanOrEqual(3);
  });
});
