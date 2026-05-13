import {
  addFlow,
  addObstacle,
  addPage,
  type Book,
  createBook,
  type ObstacleOptions,
  VERSION,
} from '../src';

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const header = document.createElement('header');
header.className = 'demo-header';
header.textContent = `TilePage v${VERSION} — 横書き 3 形状 + 縦書き`;
app.appendChild(header);

const longText =
  '本文がこの障害物を避けて 6 段組みに流れる。矩形・円・任意多角形の 3 形状に対応し、' +
  'clip-path で見た目を整形しつつ、shape-outside で同じ形のテキスト回避を実現する。' +
  '矩形と段の交差は Sutherland-Hodgman 多角形クリッピングで計算され、' +
  '各段に注入される不可視 float の shape-outside polygon としてレンダリングされる。' +
  'ResizeObserver でブラウザ幅変更時のリフローにも追従する。' +
  'A book is pages. A page is a viewport. Place rectangles. Pour text. ' +
  'これが TilePage のメンタルモデルである。';

function makePage(book: Book, title: string, shape: ObstacleOptions['shape']) {
  const page = addPage(book);
  const heading = document.createElement('div');
  heading.className = 'demo-page-title';
  heading.textContent = title;
  page.element.appendChild(heading);

  // 単色 div の obstacle にすると、text 回避が一目で分かる
  const block = document.createElement('div');
  block.style.background = '#2a2a2a';
  block.style.color = '#faf8f3';
  block.style.display = 'flex';
  block.style.alignItems = 'center';
  block.style.justifyContent = 'center';
  block.style.fontFamily = 'system-ui, sans-serif';
  block.style.fontSize = '0.85rem';
  block.style.letterSpacing = '0.1em';
  block.textContent = title;

  addObstacle(page, {
    at: { col: '2-5', row: '1-3' },
    element: block,
    shape,
    shapeMargin: '0.8em',
  });
  addFlow(page, { text: longText.repeat(3) });
}

const bookH = createBook({
  container: app,
  columns: 6,
  gutter: '0.8em',
  padding: '4em 1.5em',
});
makePage(bookH, 'rect (default)', 'rect');
makePage(bookH, 'circle', 'circle');
makePage(bookH, 'polygon — diamond', {
  type: 'polygon',
  points: [
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5],
  ],
});

// 縦書きデモ (vertical-rl)。スクロール方向は writingMode から自動 (horizontal)。
const bookV = createBook({
  container: app,
  columns: 6,
  gutter: '0.8em',
  padding: '4em 1.5em',
  writingMode: 'vertical-rl',
});
makePage(bookV, '縦書き rect', 'rect');
makePage(bookV, '縦書き circle', 'circle');
