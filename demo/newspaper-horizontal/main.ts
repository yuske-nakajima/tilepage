/// <reference types="vite/client" />
import {
  addBoxHorizontal,
  addFlow,
  addHeadlineHorizontal,
  addObstacleHorizontal,
  addPage,
  addPullquoteHorizontal,
  type Book,
  createBook,
  type Obstacle,
  VERSION,
} from '../../src';
import merosText from '../meros.txt?raw';

// newspaper-horizontal showcase: 横書き semantic obstacles の統合 showcase。
// 単一 Book / Page 上に Headline (level 1 / 3) / Pullquote / Box / 画像 Obstacle /
// paragraph スタイル付き addFlow をすべて共存させる。
//
// 段組み N は viewport 幅でスナップ (1em = 16px 基準):
//   N=8 >= 120em (=1920px) / N=6 >= 80em (=1280px) / N=4 >= 60em (=960px) / N=2 < 60em。
// 代表 viewport: desktop 1024x800 = N4 / Pixel 7 412x915 = N2。

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const header = document.createElement('header');
header.className = 'demo-header';
header.textContent = `TilePage v${VERSION} — Newspaper Horizontal Showcase`;
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

// 主見出し (h1): page 冒頭の eye-catcher。 fitToBox で枠 inline-size に対して font-size を fit。
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

// 著者見出し (h2): 主見出しと本文セクション見出しの間に挟む著者表示。
// fitToBox なしで CSS から font-size 指定。
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

// セクション小見出し (h3): 本文ブロックの導入。 h1 / h2 / h3 を揃えて意味的階層を作る。
tagObstacle(
  addHeadlineHorizontal(book, {
    level: 3,
    text: '本文',
    shape: 'rect',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 7 }, cols: 2, lines: 1 },
      4: { page: 1, at: { col: 1, line: 7 }, cols: 4, lines: 1 },
      6: { page: 1, at: { col: 1, line: 7 }, cols: 6, lines: 1 },
      8: { page: 1, at: { col: 1, line: 7 }, cols: 8, lines: 1 },
    },
  }),
  'headline-section',
);

// 画像 obstacle: 本文の reflow を視覚的に確認するための obstacle。 aspect 指定で
// lines を cols + aspect から自動導出する。
tagObstacle(
  addObstacleHorizontal(book, {
    shape: 'rect',
    src: '/meros-1-king.png',
    shapeMargin: '0.8em',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 9 }, cols: 2, aspect: '3/2' },
      4: { page: 1, at: { col: 2, line: 9 }, cols: 2, aspect: '3/2' },
      6: { page: 1, at: { col: 3, line: 9 }, cols: 3, aspect: '3/2' },
      8: { page: 1, at: { col: 4, line: 9 }, cols: 4, aspect: '3/2' },
    },
  }),
  'image-king',
);

// プルクオート: 本文中盤の引用ブロック。 引用符は CSS ::before / ::after で付与。
tagObstacle(
  addPullquoteHorizontal(book, {
    text: '邪知暴虐の王を除かなければならぬ',
    cite: 'メロス',
    shape: 'rect',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 18 }, cols: 2, lines: 4 },
      4: { page: 1, at: { col: 2, line: 18 }, cols: 2, lines: 4 },
      6: { page: 1, at: { col: 3, line: 18 }, cols: 2, lines: 4 },
      8: { page: 1, at: { col: 4, line: 18 }, cols: 2, lines: 4 },
    },
  }),
  'pullquote-main',
);

// 汎用 Box: 注釈枠。 border + padding が CSS にパススルーされる。 中身は外部 DOM を渡す。
const boxInner = document.createElement('div');
boxInner.innerHTML = '<strong>注:</strong> 本文は太宰治『走れメロス』 (青空文庫) より。';
tagObstacle(
  addBoxHorizontal(book, {
    element: boxInner,
    border: '2px solid #0a0a0a',
    padding: '1em',
    shape: 'rect',
    whenColumns: {
      2: { page: 2, at: { col: 1, line: 1 }, cols: 2, lines: 4 },
      4: { page: 2, at: { col: 1, line: 1 }, cols: 2, lines: 4 },
      6: { page: 2, at: { col: 1, line: 1 }, cols: 2, lines: 4 },
      8: { page: 2, at: { col: 1, line: 1 }, cols: 2, lines: 4 },
    },
  }),
  'box-note',
);

// box-note を page 2 に置くため、 本文流し込み前に 2 page 確保しておく。
// あふれた分は distribute 側で page が増える。
while (book.pages.length < 2) addPage(book);

// addFlow に paragraph オプション (indent / justify / kinsoku / hangingPunctuation) を全部
// 同時指定。 .tilepage-flow-text に CSS パススルーで反映される。
addFlow(book, {
  text: SOURCE_TEXT,
  paragraph: {
    indent: '1em',
    justify: true,
    kinsoku: 'strict',
    hangingPunctuation: true,
  },
});
