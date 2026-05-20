// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addBoxHorizontal, addPage, createBook } from '../TilePage';

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

describe('addBoxHorizontal', () => {
  it('element 未指定で空 div を生成し、 tilepage-box class が付く', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({
      container,
      columns: 4,
      writingMode: 'horizontal-tb',
      observeResize: false,
    });
    addPage(book);

    const obstacle = addBoxHorizontal(book, {
      whenColumns: {
        4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 2 },
      },
    });

    expect(obstacle.element.tagName).toBe('DIV');
    expect(obstacle.element.classList.contains('tilepage-box')).toBe(true);
    expect(obstacle.element.classList.contains('tilepage-obstacle')).toBe(true);
  });

  it('element 引数で渡した DOM がそのまま obstacle 要素になる', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({ container, columns: 4, observeResize: false });
    addPage(book);

    const custom = document.createElement('section');
    custom.id = 'custom-section';
    custom.textContent = 'inner-content';

    const obstacle = addBoxHorizontal(book, {
      element: custom,
      whenColumns: {
        4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 2 },
      },
    });

    expect(obstacle.element).toBe(custom);
    expect(obstacle.element.id).toBe('custom-section');
    expect(obstacle.element.textContent).toBe('inner-content');
    expect(obstacle.element.classList.contains('tilepage-box')).toBe(true);
  });

  it('border / padding が element の inline style に直接適用される', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({ container, columns: 4, observeResize: false });
    addPage(book);

    const obstacle = addBoxHorizontal(book, {
      border: '2px solid red',
      padding: '1.5em',
      whenColumns: {
        4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 2 },
      },
    });

    // jsdom は CSS の color literal を rgb 表記に正規化するため、 border は個別プロパティで検査する。
    expect(obstacle.element.style.borderWidth).toBe('2px');
    expect(obstacle.element.style.borderStyle).toBe('solid');
    expect(obstacle.element.style.padding).toBe('1.5em');
  });

  it('border / padding 未指定時は inline style に書き込まれない', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({ container, columns: 4, observeResize: false });
    addPage(book);

    const obstacle = addBoxHorizontal(book, {
      whenColumns: {
        4: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 2 },
      },
    });

    expect(obstacle.element.style.border).toBe('');
    expect(obstacle.element.style.padding).toBe('');
  });

  it('whenColumns 未指定で throw する', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const book = createBook({ container, columns: 4, observeResize: false });

    expect(() =>
      addBoxHorizontal(book, {
        // @ts-expect-error: 意図的に whenColumns を抜く
      }),
    ).toThrow(/whenColumns is required/);
  });
});
