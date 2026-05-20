/// <reference types="vite/client" />
import {
  addFlow,
  addHeadlineHorizontal,
  addPage,
  type Book,
  createBook,
  type Obstacle,
  VERSION,
} from '../../src';
import merosText from '../meros.txt?raw';

// newspaper-horizontal showcase: 横書きで意味的見出し (Headline) を obstacle として
// 配置する scaffold。 後続スプリントで Pullquote / Box を足して完成形にする。
//
// Headline の検証ポイント:
//   - level: 1-6 を指定すると <h1>-<h6> が生成される
//   - fitToBox: true で枠 inline-size に収まる最大 font-size が二分探索される
//   - whenColumns で段数別の配置を切り替えられる

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const header = document.createElement('header');
header.className = 'demo-header';
header.textContent = `TilePage v${VERSION} — Newspaper Horizontal (Headline scaffold)`;
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

if (book.pages.length < 1) addPage(book);

addFlow(book, { text: SOURCE_TEXT });
