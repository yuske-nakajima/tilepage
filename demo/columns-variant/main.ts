/// <reference types="vite/client" />
import {
  addFlow,
  addObstacleHorizontal,
  addPage,
  type Book,
  createBook,
  type Obstacle,
} from '../../src';
import merosText from '../meros.txt?raw';

// columns-variant demo: supportedColumns + breakpoints + whenColumns API。
// 走れメロス 3 画像を N=2/4/6/8 の variant で配置し、 graceful degradation も確認する。

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const SOURCE_TEXT = merosText.trim();

const book: Book = createBook({
  container: app,
  columns: {
    supported: [2, 4, 6, 8],
    breakpoints: { 8: '90em', 6: '60em', 4: '40em', 2: '0' },
  },
  gutter: '0.8em',
  padding: '4em 1.5em',
});

// 各 obstacle に data-id を持たせて E2E から個別に locator できるようにする。
function tagObstacle(obstacle: Obstacle, id: string): void {
  obstacle.element.setAttribute('data-id', id);
}

// 雑誌的に King の大判画像。 N=6 を意図的に省略して graceful degrade を確認する。
// lines / aspect ともに省略 → 画像 natural aspect から導出される。
tagObstacle(
  addObstacleHorizontal(book, {
    shape: 'rect',
    src: '/meros-1-king.png',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 1 }, cols: 2 },
      4: { page: 1, at: { col: 1, line: 1 }, cols: 2 },
      8: { page: 1, at: { col: 1, line: 1 }, cols: 3 },
    },
  }),
  'king',
);

// 走るメロス。 全 N (2/4/6/8) で variant を宣言。 aspect '3/2' を明示。
tagObstacle(
  addObstacleHorizontal(book, {
    shape: 'circle',
    src: '/meros-2-run.png',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 10 }, cols: 2, aspect: '3/2' },
      4: { page: 1, at: { col: 3, line: 3 }, cols: 2, aspect: '3/2' },
      6: { page: 1, at: { col: 4, line: 5 }, cols: 2, aspect: '3/2' },
      8: { page: 1, at: { col: 5, line: 4 }, cols: 3, aspect: '3/2' },
    },
  }),
  'run',
);

// 再会の polygon。 page 2 に配置。 aspect '3/2' を明示。
tagObstacle(
  addObstacleHorizontal(book, {
    shape: {
      type: 'polygon',
      points: [
        [0.5, 0],
        [1, 0.5],
        [0.5, 1],
        [0, 0.5],
      ],
    },
    src: '/meros-3-reunion.png',
    whenColumns: {
      2: { page: 2, at: { col: 1, line: 1 }, cols: 2, aspect: '3/2' },
      4: { page: 2, at: { col: 2, line: 2 }, cols: 2, aspect: '3/2' },
      6: { page: 2, at: { col: 3, line: 3 }, cols: 2, aspect: '3/2' },
      8: { page: 2, at: { col: 4, line: 4 }, cols: 3, aspect: '3/2' },
    },
  }),
  'reunion',
);

// page=2 の variant が ensure される前提のため page を 2 つ確保しておく。
// 並びに、 N が広めの時 (N=6/8) には text overflow しにくいよう page を追加で予約しておく
// (distribute の trimPagesAfter は obstacle を持たない page を消すので overflow したぶんは
//  自動で page を増やしてくれる。 ここでは degrade 対応として最小限の 2 page だけ確保)。
if (book.pages.length < 1) addPage(book);
if (book.pages.length < 2) addPage(book);

addFlow(book, { text: SOURCE_TEXT });

(
  window as unknown as { __tilepageColumnsVariant: { book: Book; sourceText: string } }
).__tilepageColumnsVariant = { book, sourceText: SOURCE_TEXT };

app.dataset.ready = 'true';
