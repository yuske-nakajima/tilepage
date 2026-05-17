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
//   N=8: 60em / N=6: 50em / N=4: 45em / N=2: 0 (常に true)
// 1em = 16px 基準で 高さ 960px=N8 / 800px=N6 / 720px=N4 / それ未満=N2。
// 代表 viewport: 1920x1080(67.5em)=N8 / 1024x768(48em)=N4 / 375x667(41.6em)=N2。
//
// 縦書きの whenColumns variant では:
//   at.row  = grid-row-start    (内部的に grid-row-start にマップ)
//   at.char = grid-column-start (内部的に grid-column-start にマップ)
//   rows    = grid-row span     (block 軸 = 物理 width 方向)
//   chars   = grid-column span  (inline 軸 = 物理 height 方向 = 段の本数)
// 1 cell の物理サイズ:
//   width  = rows  × line-height
//   height = chars × column-block-size + (chars-1) × gutter
// 各 viewport で line-height ≒ 25.84px (1em=16px の 1.5 倍ベース)。
// natural aspect 3:2 を狙うため rows / chars は各 N で実測ベースで明示する。

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
    breakpoints: { 8: '60em', 6: '50em', 4: '45em', 2: '0' },
  },
  gutter: '1.5em',
  padding: '4em 1.5em',
});

function tagObstacle(obstacle: Obstacle, id: string): void {
  obstacle.element.setAttribute('data-id', id);
}

// king (王) — 雑誌的な大判画像。
// 横書き demo (`demo/main.ts`) と対称な「中央寄せ + 4 辺回り込み」 を狙う配置。
// 縦書き whenColumns では:
//   at.row  = grid-row-start    (物理 X 軸 = 行進行方向 = 段組み内の行 index)
//   at.char = grid-column-start (物理 Y 軸 = 段の本数方向 = 段 index)
//   rows    = grid-row span     (物理 width = 横書きの cols 相当)
//   chars   = grid-column span  (物理 height = 段数。横書きの lines 相当)
// 各 viewport で line-height ≒ 25.84px。
tagObstacle(
  addObstacleVertical(book, {
    shape: 'rect',
    src: '/meros-1-king.png',
    shapeMargin: '0.8em',
    whenColumns: {
      // N=2 mobile: 段が 2 段しかないので 1 段を占有して画像を縦半分強に配置 (物理制約)
      2: { page: 1, at: { row: 6, char: 1 }, rows: 15, chars: 1 },
      // N=4 tablet: 中央 2 段に画像、 上下に短い縦行ブロック
      4: { page: 1, at: { row: 4, char: 2 }, rows: 18, chars: 2 },
      // N=6: 中央 2 段
      6: { page: 1, at: { row: 4, char: 3 }, rows: 14, chars: 2 },
      // N=8 desktop: 中央 3 段、 上下と左右の段に text が回り込む
      8: { page: 1, at: { row: 4, char: 3 }, rows: 20, chars: 3 },
    },
  }),
  'king',
);

// run (走るメロス) — circle shape。 page=2 系。
// 横書き `{ at: { col: 中央, line: 中央 }, cols: N/2 }` と対称な配置。
tagObstacle(
  addObstacleVertical(book, {
    shape: 'circle',
    src: '/meros-2-run.png',
    shapeMargin: '0.8em',
    whenColumns: {
      2: { page: 2, at: { row: 6, char: 1 }, rows: 15, chars: 1 },
      4: { page: 2, at: { row: 4, char: 2 }, rows: 18, chars: 2 },
      6: { page: 2, at: { row: 5, char: 3 }, rows: 14, chars: 2 },
      8: { page: 2, at: { row: 6, char: 3 }, rows: 20, chars: 3 },
    },
  }),
  'run',
);

// reunion (再会) — polygon (菱形)。 page=3 系。
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
      2: { page: 3, at: { row: 6, char: 1 }, rows: 15, chars: 1 },
      4: { page: 3, at: { row: 4, char: 2 }, rows: 18, chars: 2 },
      6: { page: 3, at: { row: 5, char: 3 }, rows: 14, chars: 2 },
      8: { page: 3, at: { row: 4, char: 3 }, rows: 20, chars: 3 },
    },
  }),
  'reunion',
);

// king/run/reunion を別 page に置くため少なくとも 3 page を先に確保しておく。
// distribute 側で本文があふれた分は自動で page が増える。
while (book.pages.length < 3) addPage(book);

addFlow(book, { text: SOURCE_TEXT });
