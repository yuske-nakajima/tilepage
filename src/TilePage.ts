import { injectStyles } from './styles/inject';
import {
  clipPolygonByRect,
  normalizeShape,
  type ObstacleShape,
  type Point,
  type Rect,
  shapeToClipPath,
} from './utils/polygon';

export type WritingMode = 'horizontal-tb' | 'vertical-rl';
export type ScrollDirection = 'vertical' | 'horizontal';

export interface BookOptions {
  container?: HTMLElement;
  columns?: number;
  gutter?: string;
  padding?: string;
  writingMode?: WritingMode;
  scrollDirection?: ScrollDirection;
}

export interface Book {
  root: HTMLElement;
  columns: number;
  writingMode: WritingMode;
  scrollDirection: ScrollDirection;
  pages: Page[];
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
  const scrollDirection: ScrollDirection =
    options.scrollDirection ?? (writingMode === 'vertical-rl' ? 'horizontal' : 'vertical');
  root.style.setProperty('--tilepage-columns', String(columns));
  if (options.gutter) root.style.setProperty('--tilepage-gutter', options.gutter);
  if (options.padding) root.style.setProperty('--tilepage-padding', options.padding);
  root.dataset.writingMode = writingMode;
  root.dataset.scroll = scrollDirection;
  if (options.container) options.container.appendChild(root);
  return { root, columns, writingMode, scrollDirection, pages: [] };
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

export function addFlow(page: Page, options: FlowOptions = {}): void {
  const text = options.text ?? '';
  for (const col of page.columnElements) {
    const flowText = col.querySelector('.tilepage-flow-text');
    const target = flowText ?? document.createElement('div');
    target.className = 'tilepage-flow-text';
    target.textContent = text;
    if (!flowText) col.appendChild(target);
  }
  reflowObstacles(page);
}

function reflowObstacles(page: Page): void {
  for (const obstacle of page.obstacles) {
    for (const f of obstacle.floats) f.remove();
    obstacle.floats.length = 0;
  }

  const pageRect = page.element.getBoundingClientRect();
  if (pageRect.width === 0 || pageRect.height === 0) return;

  const vertical = page.book.writingMode === 'vertical-rl';

  for (const obstacle of page.obstacles) {
    const obRect = obstacle.element.getBoundingClientRect();
    const obstacleBox: Rect = {
      x: obRect.left - pageRect.left,
      y: obRect.top - pageRect.top,
      width: obRect.width,
      height: obRect.height,
    };
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

      // float の物理サイズ。
      // 横書き: 幅 = column 幅 (block 軸), 高さ = clipped の max-Y (inline 軸の進行方向)
      // 縦書き: 幅 = clipped の max-X (inline 軸の進行方向は右→左、float: inline-start で右端から),
      //         高さ = column 高さ (block 軸)
      let floatWidthPx: number;
      let floatHeightPx: number;
      if (vertical) {
        let maxLocalX = 0;
        for (const [x] of clipped) {
          const localX = x - columnBox.x;
          if (localX > maxLocalX) maxLocalX = localX;
        }
        floatWidthPx = maxLocalX;
        floatHeightPx = columnBox.height;
      } else {
        let maxLocalY = 0;
        for (const [, y] of clipped) {
          const localY = y - columnBox.y;
          if (localY > maxLocalY) maxLocalY = localY;
        }
        floatWidthPx = columnBox.width;
        floatHeightPx = maxLocalY;
      }

      const localPoints = clipped
        .map(([x, y]) => `${x - columnBox.x}px ${y - columnBox.y}px`)
        .join(', ');

      const float = document.createElement('div');
      float.className = 'tilepage-obstacle-float';
      float.style.width = `${floatWidthPx}px`;
      float.style.height = `${floatHeightPx}px`;
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
