import { addFlow, addObstacle, addPage, createBook, VERSION } from '../../src';

// 縦書き (vertical-rl) book の目視確認用 demo。
// 同一 flow engine が writing-mode の違いだけで縦書き band 配置に切り替わることを示す。

const app = document.getElementById('app');
if (!app) throw new Error('#app が見つかりません');

const header = document.createElement('header');
header.className = 'demo-header';
header.textContent = `TilePage v${VERSION} — vertical-rl の 4 段組み (1 本の連続ストリーム)`;
app.appendChild(header);

const book = createBook({
  container: app,
  columns: 4,
  writingMode: 'vertical-rl',
  gutter: '0.8em',
  padding: '4em 1.5em',
});

const longText =
  '縦書き本では「段」が横方向の band として並ぶ。inline 軸 = 縦、block 軸 = 横 (右→左)。' +
  '本文は 1 本の連続ストリームとして addFlow に渡され、内部で実測 (Range + getClientRects) して' +
  '各 band に chunking 分配される。横書きと同一の flow engine が、軸抽象 (axis projection) を' +
  '介して writing-mode の違いだけ吸収して走る。段の終端で次の段の頭に折り返し、' +
  'ページ末尾でページを跨ぐ。ResizeObserver でブラウザ幅変更時にも再分配される。' +
  '矩形・円・任意多角形の 3 形状の obstacle が CSS Grid 仕様通りに軸 swap される。' +
  'TilePage v0.4 のメンタルモデル: A book is pages. A page is a viewport. Place rectangles. Pour text.';

function makePage(title: string, shape: Parameters<typeof addObstacle>[1]['shape']) {
  const page = addPage(book);
  const heading = document.createElement('div');
  heading.className = 'demo-page-title';
  heading.textContent = title;
  page.element.appendChild(heading);

  addObstacle(page, {
    at: { col: '2-3', row: '1-2' },
    shape,
    shapeMargin: '0.8em',
  });
}

makePage('vertical-rl — rect', 'rect');
makePage('vertical-rl — circle', 'circle');
makePage('vertical-rl — polygon (diamond)', {
  type: 'polygon',
  points: [
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5],
  ],
});

addFlow(book, { text: longText.repeat(2) });
