/// <reference types="vite/client" />
import {
  addFlow,
  addObstacleHorizontal,
  addPage,
  type Book,
  createBook,
  defineHeadlineHorizontal,
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
    supported: [2, 4, 6, 8],
    breakpoints: { 8: '120em', 6: '80em', 4: '60em', 2: '0' },
  },
  gutter: '1.5em',
  padding: '4em 1.5em',
});

function tagObstacle(obstacle: Obstacle, id: string): void {
  obstacle.element.setAttribute('data-id', id);
}

// 王 (king): 雑誌的な大判画像。 N=6 のときだけ variant を省略し
// graceful degrade (display:none) で隠れることを示す。
// lines / aspect ともに省略 → 画像 natural aspect (1536x1024 = 3:2) から導出される。
tagObstacle(
  addObstacleHorizontal(book, {
    shape: 'rect',
    src: '/meros-1-king.png',
    shapeMargin: '0.8em',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 100 }, cols: 2 },
      4: { page: 1, at: { col: 1, line: 1 }, cols: 2 },
      6: { page: 1, at: { col: 1, line: 1 }, cols: 3 },
      8: { page: 1, at: { col: 1, line: 100 }, cols: 4 },
    },
  }),
  'king',
);

// 走るメロス (circle)。 全 N (2/4/6/8) で variant を宣言。
// aspect を明示宣言。 cols から lines が導出され、 cell と画像のアスペクト比が一致する。
tagObstacle(
  addObstacleHorizontal(book, {
    shape: 'circle',
    src: '/meros-2-run.png',
    shapeMargin: '0.8em',
    whenColumns: {
      2: { page: 4, at: { col: 1, line: 4 }, cols: 1, aspect: '3/2' },
      4: { page: 2, at: { col: 3, line: 3 }, cols: 2, aspect: '3/2' },
      6: { page: 2, at: { col: 4, line: 5 }, cols: 3, aspect: '3/2' },
      8: { page: 2, at: { col: 5, line: 100 }, cols: 4, aspect: '3/2' },
    },
  }),
  'run',
);

// 再会 (polygon)。 page=2 に配置。 同じ画像比率に合わせて aspect を明示。
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
    // shape: 'rect',
    src: '/meros-3-reunion.png',
    shapeMargin: '0.8em',
    whenColumns: {
      2: { page: 5, at: { col: 2, line: 1 }, cols: 1, aspect: '3/2' },
      4: { page: 4, at: { col: 2, line: 2 }, cols: 2, aspect: '3/2' },
      6: { page: 3, at: { col: 3, line: 14 }, cols: 3, aspect: '3/2' },
      8: { page: 3, at: { col: 1, line: 1 }, cols: 4, aspect: '3/2' },
    },
  }),
  'reunion',
);

// main title (走れメロス) を h1 として obstacle 層に配置する。
// king (page 1) と物理的に衝突しない位置を全 N variant で割り当てる:
//   N=2: king {at:(1,100), cols:2} → main-title を col 1-2 / line 1 に置ける
//   N=4: king {at:(1,1),   cols:2} → main-title を col 3-4 / line 1 に逃がす
//   N=6: king {at:(1,1),   cols:3} → main-title を col 4-6 / line 1 に逃がす
//   N=8: king {at:(1,100), cols:4} → main-title を col 1-8 全幅 / line 1 に置ける
// fontSize=3em × lineHeight=1.2 = 3.6 base line。 obstacle 層の grid row は本文 line-height
// で刻まれるため lines=4 を割り当てて h1 glyph 高さが grid row 高さを下回るようにする
// (= 隣接段の本文と物理 overlap しない)。
const defineMainTitle = defineHeadlineHorizontal({
  fontSize: '3em',
  lineHeight: 1.2,
  fontWeight: 700,
});
tagObstacle(
  defineMainTitle(book, {
    text: '走れメロス',
    whenColumns: {
      2: { page: 1, at: { col: 1, line: 1 }, cols: 2, lines: 4 },
      4: { page: 1, at: { col: 3, line: 1 }, cols: 2, lines: 4 },
      6: { page: 1, at: { col: 4, line: 1 }, cols: 3, lines: 4 },
      8: { page: 1, at: { col: 1, line: 1 }, cols: 8, lines: 4 },
    },
  }),
  'main-title',
);

// page=2 の variant がアタッチできるよう少なくとも 2 page 確保。
// 本文が長ければ distribute 側で page が増える。
if (book.pages.length < 1) addPage(book);
if (book.pages.length < 2) addPage(book);

addFlow(book, { text: SOURCE_TEXT });
