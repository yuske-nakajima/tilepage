// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addPage, addPullquoteHorizontal, createBook } from '../TilePage';

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

describe('addPullquoteHorizontal', () => {
  it('<blockquote> を生成し、 tilepage-pullquote class が付く', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({
      container,
      columns: 4,
      writingMode: 'horizontal-tb',
      observeResize: false,
    });
    addPage(book);

    const obstacle = addPullquoteHorizontal(book, {
      text: '人を信ずる事ができぬ',
      whenColumns: {
        4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 2 },
      },
    });

    expect(obstacle.element.tagName).toBe('BLOCKQUOTE');
    expect(obstacle.element.classList.contains('tilepage-pullquote')).toBe(true);
    expect(obstacle.element.classList.contains('tilepage-obstacle')).toBe(true);
    expect(obstacle.element.textContent).toBe('人を信ずる事ができぬ');
  });

  it('cite 指定時に <cite> 子要素が生成される', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({ container, columns: 4, observeResize: false });
    addPage(book);

    const obstacle = addPullquoteHorizontal(book, {
      text: '走れメロス',
      cite: '太宰治',
      whenColumns: {
        4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 2 },
      },
    });

    const citeEl = obstacle.element.querySelector('cite');
    expect(citeEl).not.toBeNull();
    expect(citeEl?.textContent).toBe('太宰治');
  });

  it('cite 未指定時は <cite> 子要素が生成されない', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({ container, columns: 4, observeResize: false });
    addPage(book);

    const obstacle = addPullquoteHorizontal(book, {
      text: '走れメロス',
      whenColumns: {
        4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 2 },
      },
    });

    const citeEl = obstacle.element.querySelector('cite');
    expect(citeEl).toBeNull();
  });

  it('textContent に引用符 (「 」 『 』) を含まない (CSS で出す方針)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({ container, columns: 4, observeResize: false });
    addPage(book);

    const obstacle = addPullquoteHorizontal(book, {
      text: '邪知暴虐の王を除かなければならぬ',
      cite: '太宰治',
      whenColumns: {
        4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 2 },
      },
    });

    const textSpan = obstacle.element.querySelector('.tilepage-pullquote-text');
    expect(textSpan).not.toBeNull();
    const text = textSpan?.textContent ?? '';
    expect(text).not.toMatch(/[「」『』"”“]/);
    // cite 部分にも引用符を入れていないこと
    const cite = obstacle.element.querySelector('cite')?.textContent ?? '';
    expect(cite).not.toMatch(/[「」『』"”“]/);
  });

  it('whenColumns 未指定で throw する', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({ container, columns: 4, observeResize: false });

    expect(() =>
      addPullquoteHorizontal(book, {
        text: 'x',
        // @ts-expect-error: 意図的に whenColumns を抜く
      }),
    ).toThrow(/whenColumns is required/);
  });
});
