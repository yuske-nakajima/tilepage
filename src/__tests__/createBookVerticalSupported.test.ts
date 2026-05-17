// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBook } from '../TilePage';

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

describe('createBook: vertical-rl + supportedColumns', () => {
  it('vertical-rl と supportedColumns 設定の組み合わせで throw しない', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    expect(() =>
      createBook({
        container,
        writingMode: 'vertical-rl',
        columns: {
          supported: [2, 4, 6, 8],
          breakpoints: { 8: '120em', 6: '80em', 4: '60em', 2: '0' },
        },
        observeResize: false,
      }),
    ).not.toThrow();
  });

  it('vertical-rl + supportedColumns で初期 N は supported の最小値', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const book = createBook({
      container,
      writingMode: 'vertical-rl',
      columns: {
        supported: [2, 4, 6, 8],
        breakpoints: { 8: '120em', 6: '80em', 4: '60em', 2: '0' },
      },
      observeResize: false,
    });

    expect(book.writingMode).toBe('vertical-rl');
    expect(book.columns).toBe(2);
    expect(book.root.dataset.activeColumns).toBe('2');
  });
});
