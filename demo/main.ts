declare const __VERSION__: string;

import { addFlow, addObstacle, addPage, createBook, VERSION } from '../src';

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const header = document.createElement('header');
header.className = 'demo-header';
header.textContent = `TilePage v${VERSION} (build: ${__VERSION__}) — 6 段組み、矩形を避けて流れる本文`;
app.appendChild(header);

const book = createBook({ container: app, columns: 6, gutter: '0.8em', padding: '4em 1.5em' });

const page = addPage(book);

addObstacle(page, {
	at: { col: '2-5', row: '1-2' },
	src: 'https://picsum.photos/seed/tilepage/600/300',
	alt: 'サンプル画像',
	shapeMargin: '0.8em',
});

const longText =
	'本文がこの画像を避けて 6 段組みに流れる。これが動けば、ライブラリの存在意義は成立する。' +
	'矩形は CSS Grid で配置され、テキストは各段の独立した div の中で流れる。' +
	'矩形と段の交差を計算し、不可視の float を該当する段に注入することで、' +
	'テキストは矩形を避けて流れる。ResizeObserver でサイズ変化を監視し、' +
	'ブラウザ幅を変えても float が再生成される。これがコアアイデアの最小プロトタイプである。' +
	'新聞・タブロイド・A3 フリーペーパー的な紙面表現を Web 上で実現することが目的である。' +
	'矩形を置く、テキストを注ぐ。A book is pages. A page is a viewport. ' +
	'Place rectangles. Pour text. これが TilePage のメンタルモデルである。';

addFlow(page, { text: longText.repeat(3) });
