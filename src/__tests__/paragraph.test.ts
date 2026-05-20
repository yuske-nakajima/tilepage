// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addFlow, addObstacleHorizontal, addPage, createBook } from '../TilePage';

// addFlow の paragraph オプションを data 属性として .tilepage-flow-text に付与するパススルー実装の検証。
// CSS computed style は jsdom が解釈しないため、 DOM attribute / CSS 変数の付与だけを assert する。
// computed style assert は Playwright E2E (paragraph-style.spec.ts) の担当。
//
// 補足: jsdom は実 layout を持たず winBlockSize=0 で fitTextIntoWindow が early return するため、
// obstacle 無しの page は distribute の trimPagesAfter で消える (= holder も消える)。
// 各テストで page を「user 配置」 化するために addObstacleHorizontal を呼んで page 保持する。

class FakeResizeObserver {
  observe(_el: Element): void {}
  unobserve(_el: Element): void {}
  disconnect(): void {}
}

function setupBook(): ReturnType<typeof createBook> {
  document.body.innerHTML = '';
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const book = createBook({ container, columns: 3, observeResize: false });
  addPage(book);
  // page を obstacle で「user 配置」 marker し、 distribute の trimPagesAfter から保持する。
  addObstacleHorizontal(book, {
    shape: 'rect',
    whenColumns: { 3: { page: 1, at: { col: 1, line: 1 }, cols: 1, lines: 1 } },
  });
  return book;
}

function collectHolders(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.tilepage-flow-text'));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('addFlow paragraph オプション → .tilepage-flow-text data 属性', () => {
  it('paragraph 未指定で data-paragraph-* 属性が一切付かない', () => {
    const book = setupBook();
    addFlow(book, { text: 'abcdefghij' });

    const holders = collectHolders(book.root);
    expect(holders.length).toBeGreaterThan(0);
    for (const holder of holders) {
      expect(holder.hasAttribute('data-paragraph-indent')).toBe(false);
      expect(holder.hasAttribute('data-paragraph-justify')).toBe(false);
      expect(holder.hasAttribute('data-paragraph-kinsoku')).toBe(false);
      expect(holder.hasAttribute('data-paragraph-hanging-punctuation')).toBe(false);
      expect(holder.style.getPropertyValue('--tilepage-paragraph-indent')).toBe('');
    }
  });

  it('indent: "1em" 指定時、 data-paragraph-indent="1em" と CSS 変数が付く', () => {
    const book = setupBook();
    addFlow(book, { text: 'abcdefghij', paragraph: { indent: '1em' } });

    const holders = collectHolders(book.root);
    expect(holders.length).toBeGreaterThan(0);
    for (const holder of holders) {
      expect(holder.getAttribute('data-paragraph-indent')).toBe('1em');
      expect(holder.style.getPropertyValue('--tilepage-paragraph-indent')).toBe('1em');
      expect(holder.hasAttribute('data-paragraph-justify')).toBe(false);
      expect(holder.hasAttribute('data-paragraph-kinsoku')).toBe(false);
      expect(holder.hasAttribute('data-paragraph-hanging-punctuation')).toBe(false);
    }
  });

  it('indent に "0" を渡しても data 属性として有効な文字列値で流れる', () => {
    const book = setupBook();
    addFlow(book, { text: 'abcdefghij', paragraph: { indent: '0' } });
    const holders = collectHolders(book.root);
    expect(holders.length).toBeGreaterThan(0);
    for (const holder of holders) {
      expect(holder.getAttribute('data-paragraph-indent')).toBe('0');
      expect(holder.style.getPropertyValue('--tilepage-paragraph-indent')).toBe('0');
    }
  });

  describe('kinsoku 3 値', () => {
    for (const v of ['strict', 'normal', 'none'] as const) {
      it(`kinsoku: '${v}' で data-paragraph-kinsoku="${v}" が付く`, () => {
        const book = setupBook();
        addFlow(book, { text: 'abcdefghij', paragraph: { kinsoku: v } });
        const holders = collectHolders(book.root);
        expect(holders.length).toBeGreaterThan(0);
        for (const holder of holders) {
          expect(holder.getAttribute('data-paragraph-kinsoku')).toBe(v);
        }
      });
    }
  });

  it('justify: true で data-paragraph-justify="true" が付く', () => {
    const book = setupBook();
    addFlow(book, { text: 'abcdefghij', paragraph: { justify: true } });
    const holders = collectHolders(book.root);
    expect(holders.length).toBeGreaterThan(0);
    for (const holder of holders) {
      expect(holder.getAttribute('data-paragraph-justify')).toBe('true');
    }
  });

  it('justify: false / hangingPunctuation: false で対応 data 属性が付かない', () => {
    const book = setupBook();
    addFlow(book, {
      text: 'abcdefghij',
      paragraph: { justify: false, hangingPunctuation: false },
    });
    const holders = collectHolders(book.root);
    expect(holders.length).toBeGreaterThan(0);
    for (const holder of holders) {
      expect(holder.hasAttribute('data-paragraph-justify')).toBe(false);
      expect(holder.hasAttribute('data-paragraph-hanging-punctuation')).toBe(false);
    }
  });

  it('hangingPunctuation: true で data-paragraph-hanging-punctuation="true" が付く', () => {
    const book = setupBook();
    addFlow(book, { text: 'abcdefghij', paragraph: { hangingPunctuation: true } });
    const holders = collectHolders(book.root);
    expect(holders.length).toBeGreaterThan(0);
    for (const holder of holders) {
      expect(holder.getAttribute('data-paragraph-hanging-punctuation')).toBe('true');
    }
  });

  it('全オプション同時指定で 4 種類の data 属性がすべて付く', () => {
    const book = setupBook();
    addFlow(book, {
      text: 'abcdefghij',
      paragraph: {
        indent: '1.5em',
        justify: true,
        kinsoku: 'strict',
        hangingPunctuation: true,
      },
    });
    const holders = collectHolders(book.root);
    expect(holders.length).toBeGreaterThan(0);
    for (const holder of holders) {
      expect(holder.getAttribute('data-paragraph-indent')).toBe('1.5em');
      expect(holder.style.getPropertyValue('--tilepage-paragraph-indent')).toBe('1.5em');
      expect(holder.getAttribute('data-paragraph-justify')).toBe('true');
      expect(holder.getAttribute('data-paragraph-kinsoku')).toBe('strict');
      expect(holder.getAttribute('data-paragraph-hanging-punctuation')).toBe('true');
    }
  });
});
