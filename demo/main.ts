/// <reference types="vite/client" />
import {
  addFlow,
  addObstacle,
  addPage,
  type Book,
  createBook,
  type Obstacle,
  VERSION,
} from '../src';
import merosText from './meros.txt?raw';

// root demo: supportedColumns + breakpoints + whenColumns API による走れメロス組版。
// breakpoints は viewport >= threshold で最大 N を選ぶ離散スナップ。
//   N=8: 90em / N=6: 60em / N=4: 40em / N=2: 0 (常に true)
// 1em = 16px 基準で 320px=N2 / 640px=N4 / 1024px=N6 / 1440px=N8。
// king は N=6 で意図的に variant を省略し、 graceful degradation を示す。

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const header = document.createElement('header');
header.className = 'demo-header';
header.textContent = `TilePage v${VERSION} — 走れメロス (太宰治, 青空文庫) を段数 N に応じて再配置`;
app.appendChild(header);

export const SOURCE_TEXT = merosText.trim();

const book: Book = createBook({
  container: app,
  columns: {
    supported: [1, 2, 4, 6, 8],
    breakpoints: { 8: '90em', 6: '60em', 4: '40em', 2: '24em', 1: '0' },
  },
  gutter: '0.8em',
  padding: '4em 1.5em',
});

function tagObstacle(obstacle: Obstacle, id: string): void {
  obstacle.element.setAttribute('data-id', id);
}

// 王 (king): 雑誌的な大判画像。 N=6 のときだけ variant を省略し
// graceful degrade (display:none) で隠れることを示す。
// lines / aspect ともに省略 → 画像 natural aspect (1536x1024 = 3:2) から導出される。
tagObstacle(
  addObstacle(book, {
    shape: 'rect',
    src: '/meros-1-king.png',
    shapeMargin: '0.8em',
    whenColumns: {
      1: { page: 1, at: { col: 1, line: 1 }, cols: 1, inlineSize: 1 },
      2: { page: 1, at: { col: 1, line: 1 }, cols: 2 },
      4: { page: 1, at: { col: 1, line: 1 }, cols: 2 },
      // 6: 省略 (degrade)
      8: { page: 1, at: { col: 1, line: 1 }, cols: 3 },
    },
  }),
  'king',
);

// 走るメロス (circle)。 全 N (2/4/6/8) で variant を宣言。
// aspect を明示宣言。 cols から lines が導出され、 cell と画像のアスペクト比が一致する。
tagObstacle(
  addObstacle(book, {
    shape: 'circle',
    src: '/meros-2-run.png',
    shapeMargin: '0.8em',
    whenColumns: {
      1: {
        page: 1,
        at: { col: 1, line: 12 },
        cols: 1,
        aspect: '3/2',
        inlineSize: 0.5,
        align: 'inline-end',
      },
      2: { page: 1, at: { col: 1, line: 10 }, cols: 2, aspect: '3/2' },
      4: { page: 1, at: { col: 3, line: 3 }, cols: 2, aspect: '3/2' },
      6: { page: 1, at: { col: 4, line: 5 }, cols: 2, aspect: '3/2' },
      8: { page: 1, at: { col: 5, line: 4 }, cols: 3, aspect: '3/2' },
    },
  }),
  'run',
);

// 再会 (polygon)。 page=2 に配置。 同じ画像比率に合わせて aspect を明示。
tagObstacle(
  addObstacle(book, {
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
    shapeMargin: '0.8em',
    whenColumns: {
      1: {
        page: 2,
        at: { col: 1, line: 1 },
        cols: 1,
        aspect: '3/2',
        inlineSize: 0.6,
        align: 'inline-start',
      },
      2: { page: 2, at: { col: 1, line: 1 }, cols: 2, aspect: '3/2' },
      4: { page: 2, at: { col: 2, line: 2 }, cols: 2, aspect: '3/2' },
      6: { page: 2, at: { col: 3, line: 3 }, cols: 2, aspect: '3/2' },
      8: { page: 2, at: { col: 4, line: 4 }, cols: 3, aspect: '3/2' },
    },
  }),
  'reunion',
);

// page=2 の variant がアタッチできるよう少なくとも 2 page 確保。
// 本文が長ければ distribute 側で page が増える。
if (book.pages.length < 1) addPage(book);
if (book.pages.length < 2) addPage(book);

addFlow(book, { text: SOURCE_TEXT });

(window as unknown as { __tilepageBook: Book }).__tilepageBook = book;
app.dataset.ready = 'true';
