import { axisProjection, type WritingMode } from './flow/axis';
import { splitGraphemes } from './flow/chunk';
import { distribute, type FlowHost, type FlowWindow } from './flow/distribute';
import { createReflowController, type ReflowController } from './flow/reflow';
import { injectStyles } from './styles/inject';
import {
  clipPolygonByRect,
  normalizeShape,
  type ObstacleShape,
  type Point,
  type Rect,
  shapeToClipPath,
} from './utils/polygon';

export type { WritingMode } from './flow/axis';

// 段数指定。
// - number: 固定 N。grid-template-columns: repeat(N, 1fr)
// - { width }: 段幅宣言。N は page inline-size から導出する。
//   max を指定すると 1 段の上限幅 (1fr のままだと viewport をまたぐ fluid 拡張になる)。
export type ColumnsConfig = number | { width: string; max?: string };

export interface BookOptions {
  container?: HTMLElement;
  columns?: ColumnsConfig;
  gutter?: string;
  padding?: string;
  writingMode?: WritingMode;
  observeResize?: boolean;
}

export interface Book {
  root: HTMLElement;
  // 現在の有効段数 N (width モードでは reflow ごとに再計算される)。
  columns: number;
  // 元の columns 指定 (固定 N か width モードかを保持する)。
  columnsConfig: ColumnsConfig;
  pages: Page[];
  writingMode: WritingMode;
  // book 単位の唯一の source text。duplicate せずここだけに保持する。
  _sourceText: string;
  // ResizeObserver による stream 再分配 controller。
  // addFlow が呼ばれた時点で初期化される。
  _reflow?: ReflowController;
  _observeResize: boolean;
}

export interface PageOptions {
  id?: string;
}

export interface Page {
  element: HTMLElement;
  obstacleLayer: HTMLElement;
  flowLayer: HTMLElement;
  columnElements: HTMLElement[];
  obstacles: Obstacle[];
  book: Book;
  observer?: ResizeObserver;
}

export interface GridPos {
  col: string;
  row: string;
}

export interface ObstacleOptions {
  at: GridPos;
  element?: HTMLElement;
  src?: string;
  alt?: string;
  shape?: ObstacleShape;
  shapeMargin?: string;
  syncClipPath?: boolean;
}

export interface Obstacle {
  element: HTMLElement;
  colRange: [number, number];
  rowRange: [number, number];
  floats: HTMLElement[];
  shapeMargin: string;
  polygon: Point[];
}

export interface FlowOptions {
  text?: string;
}

export function parseGridRange(s: string): [number, number] {
  const m = s.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) throw new Error(`invalid grid range: ${s}`);
  const start = Number.parseInt(m[1], 10);
  const endInclusive = m[2] ? Number.parseInt(m[2], 10) : start;
  if (start < 1) throw new Error(`grid range must start at 1 or greater: ${s}`);
  if (endInclusive < start) {
    throw new Error(`grid range end must be greater than or equal to start: ${s}`);
  }
  return [start, endInclusive + 1];
}

export function createBook(options: BookOptions = {}): Book {
  injectStyles();
  const root = document.createElement('div');
  root.className = 'tilepage-book';
  const columnsConfig: ColumnsConfig = options.columns ?? 6;
  const writingMode: WritingMode = options.writingMode ?? 'horizontal-tb';
  if (options.gutter) root.style.setProperty('--tilepage-gutter', options.gutter);
  if (options.padding) root.style.setProperty('--tilepage-padding', options.padding);
  root.dataset.writingMode = writingMode;
  // 初期 N は固定 N モードなら指定値、width モードなら 1 で開始する (後で実測して上書き)。
  const initialColumns = typeof columnsConfig === 'number' ? columnsConfig : 1;
  applyColumnsToRoot(root, columnsConfig, initialColumns);
  if (options.container) options.container.appendChild(root);
  return {
    root,
    columns: initialColumns,
    columnsConfig,
    pages: [],
    writingMode,
    _sourceText: '',
    _observeResize: options.observeResize ?? true,
  };
}

// CSS 変数経由で flow-layer / obstacle-layer の grid-template-columns を駆動する。
// width モードでも実際の段数は JS で実測 N を決めるので、CSS 側は常に repeat(N, 1fr) で良い。
// (auto-fit を CSS に投げると、子要素数と一致しない場合に collapse / 空セル化されて
//  flow engine の window 数と一致しなくなる。よって CSS 側は実数 N に揃える。)
function applyColumnsToRoot(root: HTMLElement, _config: ColumnsConfig, n: number): void {
  root.style.setProperty('--tilepage-columns', String(n));
}

// width モードで現在の flow-layer inline 軸サイズから N を導出する。
// 1. 計測には実際の flow-layer (= column が並ぶ領域) を使う。padding は除外される。
// 2. 与えられた width / gutter を CSS 解決し pixel 化する
// 3. N 段 = (inline - (N-1)*gutter) / width >= 1 を満たす最大 N
// 値が壊れている (NaN / <=0) 場合は 1 段にフォールバックする。
function deriveColumnsFromWidth(book: Book, config: { width: string; max?: string }): number {
  // flow-layer が存在すれば inline 軸 = padding を引いた実領域。
  // まだ無い場合は page 要素か root を見る (近似)。
  const probe: HTMLElement = book.pages[0]?.flowLayer ?? book.pages[0]?.element ?? book.root;
  const inlineSize = inlineSizeOfElement(probe, book.writingMode);
  if (inlineSize <= 0) return 1;
  const widthPx = resolveCssLengthToPx(book.root, config.width);
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 1;
  const gutterPx = resolveCssLengthToPx(
    book.root,
    getComputedStyle(book.root).getPropertyValue('--tilepage-gutter').trim() || '1em',
  );
  const usableGutter = Number.isFinite(gutterPx) && gutterPx > 0 ? gutterPx : 0;
  // (inline + gutter) / (width + gutter) >= N を満たす最大 N。
  const n = Math.floor((inlineSize + usableGutter) / (widthPx + usableGutter));
  return Math.max(1, n);
}

function inlineSizeOfElement(el: HTMLElement, writingMode: WritingMode): number {
  // flow-layer は box-sizing: border-box + padding 持ちなので clientWidth (= 内側) ではなく
  // 実 column 配置領域を出すため clientWidth/Height を使う (padding を除いた content + padding に近い値が要る)。
  // CSS Grid の grid-template-columns は content + padding 内側に対して並ぶ。
  // よって clientWidth から padding を引いた値が「並べられる inline 軸サイズ」になる。
  const cs = getComputedStyle(el);
  if (writingMode === 'vertical-rl') {
    const padBlock =
      Number.parseFloat(cs.paddingTop || '0') + Number.parseFloat(cs.paddingBottom || '0');
    return Math.max(0, el.clientHeight - padBlock);
  }
  const padInline =
    Number.parseFloat(cs.paddingLeft || '0') + Number.parseFloat(cs.paddingRight || '0');
  return Math.max(0, el.clientWidth - padInline);
}

// "16em" / "var(--x)" 等の CSS 長さを実 pixel に解決する。
// 一時要素を作って getBoundingClientRect で width を読み取る。
// block-size は 0 のままで OK (width だけ知りたい)。
function resolveCssLengthToPx(context: HTMLElement, value: string): number {
  const probe = context.ownerDocument.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.inlineSize = value;
  context.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px;
}

export function addPage(book: Book, options: PageOptions = {}): Page {
  const page = document.createElement('div');
  page.className = 'tilepage-page';
  page.dataset.writingMode = book.writingMode;
  if (options.id) page.id = options.id;

  const obstacleLayer = document.createElement('div');
  obstacleLayer.className = 'tilepage-obstacle-layer';

  const flowLayer = document.createElement('div');
  flowLayer.className = 'tilepage-flow-layer';

  page.appendChild(flowLayer);
  page.appendChild(obstacleLayer);
  book.root.appendChild(page);

  // width モードでは page が DOM に乗ったタイミングで初めて inline サイズが分かる。
  // 1 page 目作成時に N を確定させる (2 page 目以降は既に確定済の book.columns を使う)。
  if (typeof book.columnsConfig !== 'number' && book.pages.length === 0) {
    const n = deriveColumnsFromWidth(book, book.columnsConfig);
    book.columns = n;
    applyColumnsToRoot(book.root, book.columnsConfig, n);
  }

  const columnElements: HTMLElement[] = [];
  syncColumnElementsTo(flowLayer, columnElements, book.columns);

  const pageObj: Page = {
    element: page,
    obstacleLayer,
    flowLayer,
    columnElements,
    obstacles: [],
    book,
  };

  const observer = new ResizeObserver(() => {
    reflowObstacles(pageObj);
  });
  observer.observe(page);
  pageObj.observer = observer;

  book.pages.push(pageObj);
  return pageObj;
}

export function addObstacle(page: Page, options: ObstacleOptions): Obstacle {
  let el: HTMLElement;
  if (options.element) {
    el = options.element;
  } else if (options.src) {
    const img = document.createElement('img');
    img.src = options.src;
    if (options.alt) img.alt = options.alt;
    el = img;
  } else {
    el = document.createElement('div');
  }
  el.classList.add('tilepage-obstacle');
  const colRange = parseGridRange(options.at.col);
  const rowRange = parseGridRange(options.at.row);
  el.style.gridColumn = `${colRange[0]} / ${colRange[1]}`;
  el.style.gridRow = `${rowRange[0]} / ${rowRange[1]}`;

  const polygon = normalizeShape(options.shape ?? 'rect');
  const syncClipPath = options.syncClipPath ?? true;
  if (syncClipPath && options.shape && options.shape !== 'rect') {
    el.style.clipPath = shapeToClipPath(polygon);
  }

  page.obstacleLayer.appendChild(el);

  const obstacle: Obstacle = {
    element: el,
    colRange,
    rowRange,
    floats: [],
    shapeMargin: options.shapeMargin ?? '0',
    polygon,
  };
  page.obstacles.push(obstacle);

  if (el.tagName === 'IMG' && !(el as HTMLImageElement).complete) {
    el.addEventListener(
      'load',
      () => {
        reflowObstacles(page);
        page.book._reflow?.request();
      },
      { once: true },
    );
  }
  reflowObstacles(page);
  // book に source text が流れている場合は obstacle 追加で stream の収容量が変わるため再分配。
  page.book._reflow?.request();
  return obstacle;
}

// addFlow は book 単位の唯一の入口。
// 連続ストリームを N 段に分配し、不足 page は内部で生成する。
export function addFlow(book: Book, options: FlowOptions = {}): void {
  book._sourceText = options.text ?? '';
  runDistribute(book);
  ensureReflowController(book);
}

// 既存 page の column 要素群を target 数に揃える。差分のみ DOM 操作する。
function syncColumnElementsTo(
  flowLayer: HTMLElement,
  columnElements: HTMLElement[],
  target: number,
): void {
  while (columnElements.length < target) {
    const col = flowLayer.ownerDocument.createElement('div');
    col.className = 'tilepage-column';
    col.dataset.column = String(columnElements.length + 1);
    flowLayer.appendChild(col);
    columnElements.push(col);
  }
  while (columnElements.length > target) {
    const last = columnElements.pop();
    last?.remove();
  }
  // dataset.column を再採番 (削除後にずれるため)。
  for (let i = 0; i < columnElements.length; i++) {
    columnElements[i].dataset.column = String(i + 1);
  }
}

// width モードでは reflow ごとに N を再計算し、全 page の column 要素数を揃える。
function updateColumnsForWidthMode(book: Book): void {
  if (typeof book.columnsConfig === 'number') return;
  const n = deriveColumnsFromWidth(book, book.columnsConfig);
  if (n === book.columns) return;
  book.columns = n;
  applyColumnsToRoot(book.root, book.columnsConfig, n);
  for (const page of book.pages) {
    syncColumnElementsTo(page.flowLayer, page.columnElements, n);
  }
}

function runDistribute(book: Book): void {
  // width モードでは page inline サイズが変わると N が変動する。
  // distribute 前に column 要素数を最新 viewport に合わせ直す。
  updateColumnsForWidthMode(book);

  const graphemes = splitGraphemes(book._sourceText);
  const projection = axisProjection(book.writingMode);

  const host: FlowHost = {
    pageCount: () => book.pages.length,
    ensurePage: (idx: number) => {
      while (book.pages.length <= idx) addPage(book);
    },
    trimPagesAfter: (idx: number) => {
      // obstacle を持つ page は user が明示配置したと見做し、stream に余りが無くても保持する。
      // これにより obstacle 入り page を起点にした demo / レイアウトが addFlow で消えない。
      while (book.pages.length > idx) {
        const last = book.pages[book.pages.length - 1];
        if (!last || last.obstacles.length > 0) break;
        book.pages.pop();
        last.observer?.disconnect();
        last.element.remove();
      }
    },
    windowsForPage: (idx: number): ReadonlyArray<FlowWindow> => {
      const page = book.pages[idx];
      if (!page) return [];
      return projection.readingOrder(page.columnElements).map((el) => ({ element: el }));
    },
  };

  distribute(host, graphemes, projection);
  // 再分配で obstacle の column 内交差も変動するため、各 page の float も再計算する。
  for (const page of book.pages) reflowObstacles(page);
}

function ensureReflowController(book: Book): void {
  if (!book._observeResize) return;
  if (book._reflow) return;
  book._reflow = createReflowController({
    root: book.root,
    observePages: () => book.pages.map((p) => p.element),
    run: () => runDistribute(book),
  });
}

function reflowObstacles(page: Page): void {
  for (const obstacle of page.obstacles) {
    for (const f of obstacle.floats) f.remove();
    obstacle.floats.length = 0;
  }

  const pageRect = page.element.getBoundingClientRect();
  if (pageRect.width === 0 || pageRect.height === 0) return;

  const projection = axisProjection(page.book.writingMode);
  const floatSide = projection.floatSide();

  for (const obstacle of page.obstacles) {
    const obRect = obstacle.element.getBoundingClientRect();
    const obstacleBox: Rect = {
      x: obRect.left - pageRect.left,
      y: obRect.top - pageRect.top,
      width: obRect.width,
      height: obRect.height,
    };
    // 正規化された polygon を obstacle 要素のページ絶対座標に展開
    const absPolygon: Point[] = obstacle.polygon.map(([nx, ny]) => [
      obstacleBox.x + nx * obstacleBox.width,
      obstacleBox.y + ny * obstacleBox.height,
    ]);

    for (const col of page.columnElements) {
      const colRect = col.getBoundingClientRect();
      const columnBox: Rect = {
        x: colRect.left - pageRect.left,
        y: colRect.top - pageRect.top,
        width: colRect.width,
        height: colRect.height,
      };
      const clipped = clipPolygonByRect(absPolygon, columnBox);
      if (clipped.length < 3) continue;

      // float の論理寸法は writing-mode に応じて block 軸方向に必要な分だけ取る。
      // - horizontal-tb (block 軸 = 縦): height は polygon の最下端まで、width は column 全幅
      // - vertical-rl   (block 軸 = 横、右→左): width は column 右端から polygon 最左端まで、 height は column 全高
      // 物理 px を CSS に渡さず column box に対する % で表現する (評価軸 #4)。
      const floatWidthRatio =
        floatSide === 'left'
          ? 1
          : columnBox.width > 0
            ? (columnBox.x + columnBox.width - Math.min(...clipped.map(([x]) => x))) /
              columnBox.width
            : 0;
      const floatHeightRatio =
        floatSide === 'left'
          ? columnBox.height > 0
            ? (Math.max(...clipped.map(([, y]) => y)) - columnBox.y) / columnBox.height
            : 0
          : 1;

      // float の column 内ローカル原点を column box に対する比率で得る。
      // shape-outside は float ローカル左上 (0,0) を原点とする座標。
      const floatOriginX =
        floatSide === 'left' ? columnBox.x : columnBox.x + columnBox.width * (1 - floatWidthRatio);
      const floatOriginY = columnBox.y;
      const floatWidthPx = columnBox.width * floatWidthRatio;
      const floatHeightPx = columnBox.height * floatHeightRatio;
      const localPoints =
        floatWidthPx > 0 && floatHeightPx > 0
          ? clipped
              .map(([x, y]) => {
                const lx = ((x - floatOriginX) / floatWidthPx) * 100;
                const ly = ((y - floatOriginY) / floatHeightPx) * 100;
                return `${lx.toFixed(4)}% ${ly.toFixed(4)}%`;
              })
              .join(', ')
          : '';

      const float = document.createElement('div');
      float.className = 'tilepage-obstacle-float';
      float.style.float = floatSide;
      float.style.inlineSize = `${(floatWidthRatio * 100).toFixed(4)}%`;
      float.style.blockSize = `${(floatHeightRatio * 100).toFixed(4)}%`;
      if (localPoints) float.style.shapeOutside = `polygon(${localPoints})`;
      float.style.shapeMargin = obstacle.shapeMargin;

      col.insertBefore(float, col.firstChild);
      obstacle.floats.push(float);
    }
  }
}

export function destroyBook(book: Book): void {
  book._reflow?.destroy();
  book._reflow = undefined;
  for (const page of book.pages) {
    page.observer?.disconnect();
  }
  book.root.remove();
}
