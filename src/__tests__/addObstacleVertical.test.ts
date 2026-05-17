// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addObstacleHorizontal, addObstacleVertical, addPage, createBook } from '../TilePage';

// 新 API: addObstacleHorizontal / addObstacleVertical の経路検証。
// - 縦書きの at.row / at.char / rows / chars が物理 grid に swap してマップされること
// - 横書き既存挙動 (cols/lines) が破壊されていないこと
// - whenColumns 未指定で throw すること

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

describe('addObstacleVertical', () => {
  it('vertical-rl + whenColumns で obstacle を配置し、 grid 座標が axis swap される', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 4,
      writingMode: 'vertical-rl',
      observeResize: false,
    });
    addPage(book);

    const obstacle = addObstacleVertical(book, {
      shape: 'rect',
      whenColumns: {
        4: {
          page: 1,
          // 縦書き API: 段組み相対の 2 段目 (上から 2 番目の band) に配置。
          at: { row: 2, char: 1 },
          rows: 2,
          chars: 3,
        },
      },
    });

    // 内部マッピング: at.row → at.col → grid-column-start, rows → cols → grid-column span。
    // at.char → at.line → grid-row-start, chars → lines → grid-row span。
    // よって gridColumn = '2 / span 2', gridRow = '1 / span 3'。
    expect(obstacle.element.style.gridColumn).toBe('2 / span 2');
    expect(obstacle.element.style.gridRow).toBe('1 / span 3');
  });

  it('whenColumns 未指定で throw する', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 4,
      writingMode: 'vertical-rl',
      observeResize: false,
    });

    expect(() =>
      // @ts-expect-error: 意図的に whenColumns を抜く
      addObstacleVertical(book, { shape: 'rect' }),
    ).toThrow(/whenColumns is required/);
  });

  it('全 N (2/4/6/8) で variant を宣言した obstacle が graceful degrade なしで配置される', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 4,
      writingMode: 'vertical-rl',
      observeResize: false,
    });
    addPage(book);

    const obstacle = addObstacleVertical(book, {
      shape: 'circle',
      whenColumns: {
        2: { page: 1, at: { row: 1, char: 1 }, rows: 1, chars: 2 },
        4: { page: 1, at: { row: 2, char: 1 }, rows: 2, chars: 2 },
        6: { page: 1, at: { row: 3, char: 1 }, rows: 3, chars: 2 },
        8: { page: 1, at: { row: 4, char: 1 }, rows: 4, chars: 2 },
      },
    });

    // 現在 N=4 が選ばれて display:none にならない。
    expect(obstacle.element.style.display).not.toBe('none');
    expect(obstacle.element.dataset.whenColumns).toBe('4');
  });

  it('現在 N に variant が無いと degrade (display:none) される', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 4,
      writingMode: 'vertical-rl',
      observeResize: false,
    });
    addPage(book);

    const obstacle = addObstacleVertical(book, {
      shape: 'rect',
      whenColumns: {
        // N=4 だけ意図的に省略 → degrade
        2: { page: 1, at: { row: 1, char: 1 }, rows: 1, chars: 2 },
        6: { page: 1, at: { row: 3, char: 1 }, rows: 3, chars: 2 },
      },
    });

    expect(obstacle.element.style.display).toBe('none');
  });
});

describe('addObstacleHorizontal', () => {
  it('horizontal-tb + whenColumns で obstacle を配置し、 grid 座標がそのまま反映される', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 4,
      writingMode: 'horizontal-tb',
      observeResize: false,
    });
    addPage(book);

    const obstacle = addObstacleHorizontal(book, {
      shape: 'rect',
      whenColumns: {
        4: { page: 1, at: { col: 2, line: 1 }, cols: 2, lines: 3 },
      },
    });

    expect(obstacle.element.style.gridColumn).toBe('2 / span 2');
    expect(obstacle.element.style.gridRow).toBe('1 / span 3');
  });

  it('whenColumns 未指定で throw する', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      columns: 4,
      writingMode: 'horizontal-tb',
      observeResize: false,
    });

    expect(() =>
      // @ts-expect-error: 意図的に whenColumns を抜く
      addObstacleHorizontal(book, { shape: 'rect' }),
    ).toThrow(/whenColumns is required/);
  });
});
