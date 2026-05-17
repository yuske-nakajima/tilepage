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
// 走れメロスの縦組み。 viewport の高さ (vertical-rl の inline 軸) に応じて段数 N=2/4/6/8 が
// 切り替わる。 breakpoints の比較対象は window.innerHeight になる。
//   N=8: 60em / N=6: 50em / N=4: 45em / N=2: 0 (常に true)
// 1em = 16px 基準で 高さ 960px=N8 / 800px=N6 / 720px=N4 / それ未満=N2。
// 代表 viewport: 1920x1080(67.5em)=N8 / 1024x768(48em)=N4 / 375x667(41.6em)=N2。
//
// 縦書き whenColumns variant のフィールド意味論:
//   at.row  = grid-row-start    (block 軸 = 物理 X 方向の起点 = 行 index)
//   at.char = grid-column-start (inline 軸 = 物理 Y 方向の起点 = 段 index)
//   chars   = grid-column span  (inline 軸 span = 段組み相対の「段の数」 = 横書きの cols 相当)
//   rows    = grid-row span     (block  軸 span = lineHeight 単位の行数 = 横書きの lines 相当)
//   aspect  = 'W/H' (画像 W:H 比)。 rows 省略時に chars + aspect から rows を自動導出する。
// 横書き demo (`demo/main.ts`) と完全対称な書き方をすることで axis swap の正しさを示す。

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

// king (王) — 雑誌的な大判画像。 横書き mobile N=2 で `cols: 2` (両段占有) と対称に
// 縦書きでは `chars: 2` (両段占有) を採用。 aspect 指定で rows を自動導出する。
tagObstacle(
  addObstacleVertical(book, {
    shape: 'rect',
    src: '/meros-1-king.png',
    shapeMargin: '0.8em',
    whenColumns: {
      // N=2 mobile: 両段 (chars=2) 占有。 横書き king の cols=2 と完全対称。
      2: { page: 1, at: { row: 1, char: 1 }, chars: 2, aspect: '3/2' },
      // N=4 tablet: 中央 2 段に画像。
      4: { page: 1, at: { row: 1, char: 2 }, chars: 2, aspect: '3/2' },
      // N=6: 中央 3 段。
      6: { page: 1, at: { row: 1, char: 2 }, chars: 3, aspect: '3/2' },
      // N=8 desktop: 中央 4 段。
      8: { page: 1, at: { row: 1, char: 3 }, chars: 4, aspect: '3/2' },
    },
  }),
  'king',
);

// run (走るメロス) — circle shape。 横書き run の `cols: 1, aspect: '3/2'` と完全対称な
// 縦書き `chars: 1, aspect: '3/2'` で 1 段占有 + aspect 自動導出。
tagObstacle(
  addObstacleVertical(book, {
    shape: 'circle',
    src: '/meros-2-run.png',
    shapeMargin: '0.8em',
    whenColumns: {
      2: { page: 2, at: { row: 4, char: 1 }, chars: 1, aspect: '3/2' },
      4: { page: 2, at: { row: 3, char: 3 }, chars: 2, aspect: '3/2' },
      6: { page: 2, at: { row: 5, char: 4 }, chars: 3, aspect: '3/2' },
      8: { page: 2, at: { row: 5, char: 5 }, chars: 4, aspect: '3/2' },
    },
  }),
  'run',
);

// reunion (再会) — polygon (菱形)。 横書き reunion と対称。
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
      2: { page: 3, at: { row: 1, char: 2 }, chars: 1, aspect: '3/2' },
      4: { page: 3, at: { row: 2, char: 2 }, chars: 2, aspect: '3/2' },
      6: { page: 3, at: { row: 14, char: 3 }, chars: 3, aspect: '3/2' },
      8: { page: 3, at: { row: 1, char: 1 }, chars: 4, aspect: '3/2' },
    },
  }),
  'reunion',
);

// king/run/reunion を別 page に置くため少なくとも 3 page を先に確保しておく。
// distribute 側で本文があふれた分は自動で page が増える。
while (book.pages.length < 3) addPage(book);

addFlow(book, { text: SOURCE_TEXT });
