/// <reference types="vite/client" />
import {
  addBoxHorizontal,
  addFlow,
  addHeadlineHorizontal,
  addPage,
  addPullquoteHorizontal,
  type Book,
  createBook,
  type Obstacle,
  VERSION,
} from '../../src';
import merosText from '../meros.txt?raw';

// newspaper-horizontal showcase: 横書きで意味的見出し (Headline) + 引用 (Pullquote) +
// 汎用 Box を obstacle として配置する scaffold。
//
// 検証ポイント:
//   - Headline: level / fitToBox / whenColumns
//   - Pullquote: <blockquote> + <cite> + CSS quotes
//   - Box: border / padding パススルー、 任意 element 受け取り

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const header = document.createElement('header');
header.className = 'demo-header';
header.textContent = `TilePage v${VERSION} — Newspaper Horizontal (Headline + Pullquote + Box)`;
app.appendChild(header);

const SOURCE_TEXT = merosText.trim();

const book: Book = createBook({
  container: app,
  columns: {
    supported: [2, 4, 6, 8],
    breakpoints: { 8: '120em', 6: '80em', 4: '60em', 2: '0' },
  },
  gutter: '1.5em',
  padding: '4em 1.5em',
});

function tagObstacle(obstacle: Obstacle, id: string): void {
  obstacle.element.setAttribute('data-id', id);
}

// 大見出し: page 冒頭の eye-catcher。 fitToBox で枠 inline-size に最大 font-size を fit。
tagObstacle(
  addHeadlineHorizontal(book, {
    level: 1,
    text: '走れメロス',
    fitToBox: true,
    shape: 'rect',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 3 },
      4: { page: 1, at: { col: 1, line: 1 }, cols: 4, lines: 3 },
      6: { page: 1, at: { col: 1, line: 1 }, cols: 6, lines: 3 },
      8: { page: 1, at: { col: 1, line: 1 }, cols: 8, lines: 3 },
    },
  }),
  'headline-main',
);

// 副見出し: fitToBox なし (固定 font-size を CSS から差せるよう open にする)。
tagObstacle(
  addHeadlineHorizontal(book, {
    level: 2,
    text: '太宰治',
    shape: 'rect',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 5 }, cols: 2, lines: 1 },
      4: { page: 1, at: { col: 1, line: 5 }, cols: 4, lines: 1 },
      6: { page: 1, at: { col: 1, line: 5 }, cols: 6, lines: 1 },
      8: { page: 1, at: { col: 1, line: 5 }, cols: 8, lines: 1 },
    },
  }),
  'headline-sub',
);

// プルクオート: 本文の中盤に挿し込む引用。 引用符は CSS で付与される。
tagObstacle(
  addPullquoteHorizontal(book, {
    text: '邪知暴虐の王を除かなければならぬ',
    cite: 'メロス',
    shape: 'rect',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 12 }, cols: 2, lines: 4 },
      4: { page: 1, at: { col: 2, line: 10 }, cols: 2, lines: 4 },
      6: { page: 1, at: { col: 3, line: 10 }, cols: 2, lines: 4 },
      8: { page: 1, at: { col: 4, line: 10 }, cols: 2, lines: 4 },
    },
  }),
  'pullquote-main',
);

// 汎用 Box: 注釈枠。 border + padding パススルーの確認。 中身は呼び出し側の DOM を渡す。
const boxInner = document.createElement('div');
boxInner.innerHTML = '<strong>注:</strong> 本文は太宰治『走れメロス』 より。';
tagObstacle(
  addBoxHorizontal(book, {
    element: boxInner,
    border: '2px solid #0a0a0a',
    padding: '1em',
    shape: 'rect',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 20 }, cols: 2, lines: 4 },
      4: { page: 1, at: { col: 1, line: 20 }, cols: 2, lines: 4 },
      6: { page: 1, at: { col: 1, line: 20 }, cols: 2, lines: 4 },
      8: { page: 1, at: { col: 1, line: 20 }, cols: 2, lines: 4 },
    },
  }),
  'box-note',
);

if (book.pages.length < 1) addPage(book);

addFlow(book, {
  text: SOURCE_TEXT,
  paragraph: {
    indent: '1em',
    justify: true,
    kinsoku: 'strict',
    hangingPunctuation: true,
  },
});
