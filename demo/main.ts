import { addFlow, addObstacle, addPage, createBook, VERSION } from '../src';

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const header = document.createElement('header');
header.className = 'demo-header';
header.textContent = `TilePage v${VERSION} — rect / circle / polygon の 3 形状を 6 段組みで`;
app.appendChild(header);

const book = createBook({ container: app, columns: 6, gutter: '0.8em', padding: '4em 1.5em' });

// 3 形状の obstacle を 3 page にそれぞれ配置する。flow は 1 本の連続 stream として
// page 1 -> 2 -> 3 に流れる。各 page に同じ text を duplicate しない。
const shapes: Array<Parameters<typeof addObstacle>[1]['shape']> = [
  'rect',
  'circle',
  {
    type: 'polygon',
    points: [
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ],
  },
];

for (const shape of shapes) {
  const page = addPage(book);
  addObstacle(page, {
    at: { col: '2-5', row: '1-3' },
    src: 'https://picsum.photos/seed/tilepage/600/400',
    shape,
    shapeMargin: '0.8em',
  });
}

const sourceText =
  '本文がこの障害物を避けて 6 段組みに流れる。矩形・円・任意多角形の 3 形状に対応し、' +
  'clip-path で見た目を整形しつつ、shape-outside で同じ形のテキスト回避を実現する。' +
  '矩形と段の交差は Sutherland-Hodgman 多角形クリッピングで計算され、' +
  '各段に注入される不可視 float の shape-outside polygon としてレンダリングされる。' +
  'ResizeObserver でブラウザ幅変更時のリフローにも追従する。' +
  'A book is pages. A page is a viewport. Place rectangles. Pour text. ' +
  'これが TilePage のメンタルモデルである。';

addFlow(book, { text: sourceText });
