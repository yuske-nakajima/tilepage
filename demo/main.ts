/// <reference types="vite/client" />
import { addFlow, addObstacle, addPage, createBook, VERSION } from '../src';
import merosText from './meros.txt?raw';

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const header = document.createElement('header');
header.className = 'demo-header';
header.textContent = `TilePage v${VERSION} — 走れメロス (太宰治, 青空文庫) を段幅 16em で自動分配`;
app.appendChild(header);

const book = createBook({
  container: app,
  columns: { width: '16em' },
  gutter: '0.8em',
  padding: '4em 1.5em',
});

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
    src: '/meros.png',
    shape,
    shapeMargin: '0.8em',
  });
}

export const SOURCE_TEXT = merosText.trim();

addFlow(book, { text: SOURCE_TEXT });
