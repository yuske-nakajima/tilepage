import { axisProjection, type WritingMode } from './flow/axis';
import { splitGraphemes } from './flow/chunk';
import { distribute, type FlowHost, type FlowWindow } from './flow/distribute';
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
}

export interface Book {
  root: HTMLElement;
  columns: number;
  pages: Page[];
  writingMode: WritingMode;
  // book 単位の唯一の source text。duplicate せずここだけに保持する。
  _sourceText: string;
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
  return { root, columns, pages: [], writingMode, _sourceText: '' };
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
    el.addEventListener('load', () => reflowObstacles(page), { once: true });
  }
  reflowObstacles(page);
  return obstacle;
}

// addFlow は book 単位 / page 単位の 2 形態を受ける。
// - book 単位: 連続ストリームを N 段に分配し、不足 page は内部で生成する (v0.4)
// - page 単位: 既存 v0.1 互換。各 column に同じ text を入れる
export function addFlow(target: Book, options: FlowOptions): void;
export function addFlow(target: Page, options?: FlowOptions): void;
export function addFlow(target: Book | Page, options: FlowOptions = {}): void {
  if (isBook(target)) {
    flowIntoBook(target, options.text ?? '');
    return;
  }
  const page = target;
  const text = options.text ?? '';
  for (const col of page.columnElements) {
    const flowText = col.querySelector('.tilepage-flow-text');
    const t = flowText ?? document.createElement('div');
    t.className = 'tilepage-flow-text';
    t.textContent = text;
    if (!flowText) col.appendChild(t);
  }
  reflowObstacles(page);
}

function isBook(t: Book | Page): t is Book {
  return (t as Book).pages !== undefined && (t as Page).columnElements === undefined;
}

function flowIntoBook(book: Book, text: string): void {
  book._sourceText = text;
  const graphemes = splitGraphemes(text);
  const projection = axisProjection(book.writingMode);

  const host: FlowHost = {
    pageCount: () => book.pages.length,
    ensurePage: (idx: number) => {
      while (book.pages.length <= idx) addPage(book);
    },
    trimPagesAfter: (idx: number) => {
      while (book.pages.length > idx) {
        const removed = book.pages.pop();
        if (!removed) break;
        removed.observer?.disconnect();
        removed.element.remove();
      }
    },
    windowsForPage: (idx: number): ReadonlyArray<FlowWindow> => {
      const page = book.pages[idx];
      if (!page) return [];
      return projection.readingOrder(page.columnElements).map((el) => ({ element: el }));
    },
  };

  distribute(host, graphemes, projection);
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

      // float の物理寸法は writing-mode に応じて: block 軸方向に必要な分だけ取る。
      // - horizontal-tb (block 軸 = 縦): height は polygon の最下端 (column 上端から)、width は column 全幅
      // - vertical-rl   (block 軸 = 横、右→左): width は column 右端から polygon の最左端まで、 height は column 全高
      const floatWidth =
        floatSide === 'left'
          ? columnBox.width
          : columnBox.x + columnBox.width - Math.min(...clipped.map(([x]) => x));
      const floatHeight =
        floatSide === 'left'
          ? Math.max(...clipped.map(([, y]) => y)) - columnBox.y
          : columnBox.height;

      // float のローカル原点は writing-mode に応じて column 内物理位置が変わる。
      // shape-outside は float 内ローカル左上 (0,0) を原点とする物理座標。
      const floatOriginX =
        floatSide === 'left' ? columnBox.x : columnBox.x + columnBox.width - floatWidth;
      const floatOriginY = columnBox.y;
      const localPoints = clipped
        .map(([x, y]) => `${x - floatOriginX}px ${y - floatOriginY}px`)
        .join(', ');

      const float = document.createElement('div');
      float.className = 'tilepage-obstacle-float';
      float.style.float = floatSide;
      float.style.width = `${floatWidth}px`;
      float.style.height = `${floatHeight}px`;
      float.style.shapeOutside = `polygon(${localPoints})`;
      float.style.shapeMargin = obstacle.shapeMargin;

      col.insertBefore(float, col.firstChild);
      obstacle.floats.push(float);
    }
  }
}

export function destroyBook(book: Book): void {
  for (const page of book.pages) {
    page.observer?.disconnect();
  }
  book.root.remove();
}
