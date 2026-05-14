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

export interface BookOptions {
  container?: HTMLElement;
  columns?: number;
  gutter?: string;
  padding?: string;
  writingMode?: WritingMode;
  observeResize?: boolean;
}

export interface Book {
  root: HTMLElement;
  columns: number;
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
  const columns = options.columns ?? 6;
  const writingMode: WritingMode = options.writingMode ?? 'horizontal-tb';
  root.style.setProperty('--tilepage-columns', String(columns));
  if (options.gutter) root.style.setProperty('--tilepage-gutter', options.gutter);
  if (options.padding) root.style.setProperty('--tilepage-padding', options.padding);
  root.dataset.writingMode = writingMode;
  if (options.container) options.container.appendChild(root);
  return {
    root,
    columns,
    pages: [],
    writingMode,
    _sourceText: '',
    _observeResize: options.observeResize ?? true,
  };
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

  const columnElements: HTMLElement[] = [];
  for (let i = 0; i < book.columns; i++) {
    const col = document.createElement('div');
    col.className = 'tilepage-column';
    col.dataset.column = String(i + 1);
    flowLayer.appendChild(col);
    columnElements.push(col);
  }

  page.appendChild(flowLayer);
  page.appendChild(obstacleLayer);
  book.root.appendChild(page);

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

function runDistribute(book: Book): void {
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
