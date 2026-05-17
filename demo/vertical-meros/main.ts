/// <reference types="vite/client" />
import {
  addFlow,
  addObstacleVertical,
  addPage,
  type Book,
  createBook,
  type Obstacle,
  VERSION,
} from '../../src';
import merosText from '../meros.txt?raw';

// 縦書き (vertical-rl) demo: supportedColumns + breakpoints + whenColumns API による
// 走れメロスの縦組み。 viewport の高さに応じて段数 N=2/4/6/8 が切り替わる。
// 縦書きでは inline 軸 = viewport の高さ (vertical-rl の文字進行方向) なので
// breakpoints の比較対象は window.innerHeight になる (`deriveColumnsFromSupported` 参照)。
//   N=8: 90em / N=6: 65em / N=4: 45em / N=2: 0 (常に true)
// 1em = 16px 基準で 高さ 1440px=N8 / 1040px=N6 / 720px=N4 / それ未満=N2。
//
// 縦書きの whenColumns variant では:
//   at.row  = grid-row-start  (1-indexed, 段内の char 位置に相当)
//   at.char = grid-col-start  (1-indexed, 段番号に相当)
//   rows    = grid-row span   (block 軸 = vertical-rl の物理 width 方向の span。 1 単位 = lineHeight)
//   chars   = grid-col span   (inline 軸 = vertical-rl の物理 height 方向の span。 1 単位 = 1 段)
//            省略時は aspect (or 画像 natural aspect) と rows から逆算される
// rows を大きくすれば画像の物理 X 軸 (= 縦書き本での画像 width) が大きくなる。

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const header = document.createElement('header');
header.className = 'demo-header';
header.textContent = `TilePage v${VERSION} — 走れメロス (太宰治, 青空文庫) を縦書きで再配置`;
app.appendChild(header);

export const SOURCE_TEXT = merosText.trim();

const book: Book = createBook({
  container: app,
  writingMode: 'vertical-rl',
  columns: {
    supported: [2, 4, 6, 8],
    breakpoints: { 8: '90em', 6: '65em', 4: '45em', 2: '0' },
  },
  gutter: '1.5em',
  padding: '4em 1.5em',
});

function tagObstacle(obstacle: Obstacle, id: string): void {
  obstacle.element.setAttribute('data-id', id);
}

// 王 (king): 雑誌的な大判画像。 N 全数 (2/4/6/8) で variant を定義。
// chars / aspect ともに省略 → 画像 natural aspect (1536x1024 = 3:2) から chars を導出。
// rows が小さい N では画像も小さく出る (N=4 で rows=10 / N=8 で rows=20)。
tagObstacle(
  addObstacleVertical(book, {
    shape: 'rect',
    src: '/meros-1-king.png',
    shapeMargin: '0.8em',
    whenColumns: {
      2: { page: 1, at: { row: 1, char: 1 }, rows: 22 },
      4: { page: 1, at: { row: 1, char: 1 }, rows: 16 },
      6: { page: 1, at: { row: 1, char: 1 }, rows: 18 },
      8: { page: 1, at: { row: 1, char: 1 }, rows: 20 },
    },
  }),
  'king',
);

// 走るメロス (circle)。 全 N (2/4/6/8) で variant を宣言。
// aspect '3/2' を明示し、 chars 省略経路で rows + aspect から chars を逆算させる。
tagObstacle(
  addObstacleVertical(book, {
    shape: 'circle',
    src: '/meros-2-run.png',
    shapeMargin: '0.8em',
    whenColumns: {
      2: { page: 4, at: { row: 1, char: 1 }, rows: 12, aspect: '3/2' },
      4: { page: 2, at: { row: 3, char: 1 }, rows: 10, aspect: '3/2' },
      6: { page: 2, at: { row: 3, char: 2 }, rows: 12, aspect: '3/2' },
      8: { page: 2, at: { row: 3, char: 3 }, rows: 14, aspect: '3/2' },
    },
  }),
  'run',
);

// 再会 (polygon)。 page=2 以降。 chars を省略し aspect '3/2' から逆算させる。
tagObstacle(
  addObstacleVertical(book, {
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
      2: { page: 5, at: { row: 1, char: 1 }, rows: 12, aspect: '3/2' },
      4: { page: 4, at: { row: 1, char: 2 }, rows: 10, aspect: '3/2' },
      6: { page: 3, at: { row: 1, char: 4 }, rows: 12, aspect: '3/2' },
      8: { page: 3, at: { row: 1, char: 5 }, rows: 14, aspect: '3/2' },
    },
  }),
  'reunion',
);

// page=2 以降の variant がアタッチできるよう少なくとも 2 page 確保。
// 本文が長ければ distribute 側で page が増える。
if (book.pages.length < 1) addPage(book);
if (book.pages.length < 2) addPage(book);

addFlow(book, { text: SOURCE_TEXT });
