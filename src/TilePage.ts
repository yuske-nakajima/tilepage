import { axisProjection, type WritingMode } from './flow/axis';
import { splitGraphemes } from './flow/chunk';
import { distribute, type FlowHost, type FlowWindow } from './flow/distribute';
import { measureLineHeight } from './flow/measure';
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
// - { supported, breakpoints }: 著者が許可した N の集合に離散スナップする。
//   breakpoints[N] は CSS 長さリテラル ('40em' 等)。viewport inline-size が
//   threshold 以上を満たすうち最大の N を選ぶ。該当なしは supported の最小値。
export type ColumnsConfig =
  | number
  | { width: string; max?: string }
  | { supported: number[]; breakpoints: Record<number, string> };

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
  // addObstacle(book, ...) で登録された whenColumns 持ち obstacle 群。
  // N 変化時に resolveVariantsForBook で再評価され、 page 間を移動する。
  _variantObstacles: Obstacle[];
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

// 段数 N が一致した時に採用される配置 variant。
// at.col / at.line は 1-indexed。 line は obstacle-layer の auto-fill row index。
export interface WhenColumnsVariant {
  page: number;
  at: { col: number; line: number };
  cols: number;
  lines: number;
}

export interface ObstacleOptions {
  // legacy: 物理 row 番号で配置する経路。 whenColumns 未指定時のみ有効。
  at?: GridPos;
  // 段数 N → variant の辞書。 現在の N に一致する variant が選ばれる。
  // 未一致 N では obstacle が display:none で隠れる (graceful degradation)。
  whenColumns?: Record<number, WhenColumnsVariant>;
  element?: HTMLElement;
  src?: string;
  alt?: string;
  shape?: ObstacleShape;
  shapeMargin?: string;
  syncClipPath?: boolean;
}

export interface Obstacle {
  element: HTMLElement;
  // legacy at で配置された場合の grid 範囲。 whenColumns 経路では空 [0,0]。
  colRange: [number, number];
  rowRange: [number, number];
  floats: HTMLElement[];
  shapeMargin: string;
  polygon: Point[];
  // whenColumns 経路の保持データ。 legacy at の場合は undefined。
  whenColumns?: Record<number, WhenColumnsVariant>;
  // whenColumns 経路で「現状どの page に居るか」を保持する。 N 変化で page を移動する。
  currentPage?: Page;
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

// ColumnsConfig 3 モードの判別 helper。Union 拡張に伴う runtime guard。
function isFixedNumberMode(config: ColumnsConfig): config is number {
  return typeof config === 'number';
}
function isSupportedMode(
  config: ColumnsConfig,
): config is { supported: number[]; breakpoints: Record<number, string> } {
  return typeof config === 'object' && 'supported' in config;
}

export function createBook(options: BookOptions = {}): Book {
  injectStyles();
  const root = document.createElement('div');
  root.className = 'tilepage-book';
  const columnsConfig: ColumnsConfig = options.columns ?? 6;
  const writingMode: WritingMode = options.writingMode ?? 'horizontal-tb';
  // vertical-rl + supportedColumns の組み合わせは line グリッドの軸 swap が
  // 未整備のため本バージョンでは未対応。 createBook 時点で早期 throw する。
  if (writingMode === 'vertical-rl' && isSupportedMode(columnsConfig)) {
    throw new Error(
      'tilepage: writingMode "vertical-rl" with supportedColumns is not supported yet',
    );
  }
  if (options.gutter) root.style.setProperty('--tilepage-gutter', options.gutter);
  if (options.padding) root.style.setProperty('--tilepage-padding', options.padding);
  root.dataset.writingMode = writingMode;
  // 初期 N の決め方:
  // - 固定 N モード: そのまま使う
  // - supportedColumns モード: 最小値で開始 (page DOM 取得後に viewport で再評価)
  // - width モード: 1 で開始 (page DOM 取得後に実測)
  let initialColumns: number;
  if (isFixedNumberMode(columnsConfig)) {
    initialColumns = columnsConfig;
  } else if (isSupportedMode(columnsConfig)) {
    validateSupportedConfig(columnsConfig);
    initialColumns = Math.min(...columnsConfig.supported);
  } else {
    initialColumns = 1;
  }
  applyColumnsToRoot(root, columnsConfig, initialColumns);
  // E2E / DevTools 用に root へ現在 N を同期する (data-active-columns)。
  root.dataset.activeColumns = String(initialColumns);
  if (options.container) options.container.appendChild(root);
  return {
    root,
    columns: initialColumns,
    columnsConfig,
    pages: [],
    writingMode,
    _sourceText: '',
    _observeResize: options.observeResize ?? true,
    _variantObstacles: [],
  };
}

// supportedColumns / breakpoints の整合性チェック。
// breakpoints のキーは supported に含まれる N でなければならない (設計判断)。
function validateSupportedConfig(config: {
  supported: number[];
  breakpoints: Record<number, string>;
}): void {
  if (config.supported.length === 0) {
    console.warn('[tilepage] columns.supported is empty; defaulting N=1');
    return;
  }
  const set = new Set(config.supported);
  for (const key of Object.keys(config.breakpoints)) {
    const n = Number.parseInt(key, 10);
    if (!set.has(n)) {
      console.warn(
        `[tilepage] columns.breakpoints[${key}] is not in supported [${config.supported.join(',')}]; ignored`,
      );
    }
  }
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

  // 固定 N 以外のモードでは page が DOM に乗ったタイミングで初めて inline サイズが分かる。
  // 1 page 目作成時に N を確定させる (2 page 目以降は既に確定済の book.columns を使う)。
  if (!isFixedNumberMode(book.columnsConfig) && book.pages.length === 0) {
    const n = resolveColumnsForConfig(book, book.columnsConfig);
    book.columns = n;
    applyColumnsToRoot(book.root, book.columnsConfig, n);
    book.root.dataset.activeColumns = String(n);
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

// addObstacle は 2 つの呼び出し方を持つ。
// - addObstacle(page, options): legacy 経路。 options.at の物理 row 番号で配置する。
// - addObstacle(book, options): whenColumns 経路。 現在 N に対応する variant が
//   選ばれ、 未一致 N では display:none で隠れる (graceful degradation)。
export function addObstacle(page: Page, options: ObstacleOptions): Obstacle;
export function addObstacle(book: Book, options: ObstacleOptions): Obstacle;
export function addObstacle(target: Page | Book, options: ObstacleOptions): Obstacle {
  if (isBook(target)) return addObstacleToBook(target, options);
  return addObstacleToPage(target, options);
}

// 第一引数の Book / Page 判別。 Book は _variantObstacles を必ず持つ。
function isBook(target: Page | Book): target is Book {
  return '_variantObstacles' in target;
}

function addObstacleToPage(page: Page, options: ObstacleOptions): Obstacle {
  if (!options.at) {
    throw new Error('addObstacle(page, ...): options.at is required (legacy path)');
  }
  if (options.whenColumns) {
    throw new Error('addObstacle(page, ...): options.whenColumns must be used with book argument');
  }
  const el = createObstacleElement(options);
  const polygon = normalizeShape(options.shape ?? 'rect');
  applyClipPath(el, options.shape, polygon);

  const colRange = parseGridRange(options.at.col);
  const rowRange = parseGridRange(options.at.row);
  el.style.gridColumn = `${colRange[0]} / ${colRange[1]}`;
  el.style.gridRow = `${rowRange[0]} / ${rowRange[1]}`;
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
  triggerRedistribute(page.book);
  return obstacle;
}

function addObstacleToBook(book: Book, options: ObstacleOptions): Obstacle {
  if (!options.whenColumns) {
    throw new Error('addObstacle(book, ...): options.whenColumns is required');
  }
  if (options.at) {
    throw new Error('addObstacle(book, ...): options.at must not be combined with whenColumns');
  }
  const el = createObstacleElement(options);
  const polygon = normalizeShape(options.shape ?? 'rect');
  applyClipPath(el, options.shape, polygon);
  // DOM には乗せるが page は variant 解決時に決まる。 初期は detached のまま data-id 等の
  // 検査が成り立つよう book.root の外には出さず、 まず空の data-when-columns を付ける。
  el.dataset.whenColumns = '';

  const obstacle: Obstacle = {
    element: el,
    colRange: [0, 0],
    rowRange: [0, 0],
    floats: [],
    shapeMargin: options.shapeMargin ?? '0',
    polygon,
    whenColumns: options.whenColumns,
  };
  book._variantObstacles.push(obstacle);

  if (el.tagName === 'IMG' && !(el as HTMLImageElement).complete) {
    el.addEventListener(
      'load',
      () => {
        if (obstacle.currentPage) reflowObstacles(obstacle.currentPage);
        book._reflow?.request();
      },
      { once: true },
    );
  }
  // 現在 N で variant を解決し、 適切な page に append する。
  resolveVariantsForBook(book);
  triggerRedistribute(book);
  return obstacle;
}

// obstacle 要素 (img or div) を生成して .tilepage-obstacle class を付ける。
function createObstacleElement(options: ObstacleOptions): HTMLElement {
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
  return el;
}

function applyClipPath(el: HTMLElement, shape: ObstacleShape | undefined, polygon: Point[]): void {
  if (shape && shape !== 'rect') {
    el.style.clipPath = shapeToClipPath(polygon);
  }
}

// obstacle 追加 / N 変化後の stream 再分配 trigger。
// observeResize:true は controller 経由、 false でも source text 既存なら同期的に走らせる。
function triggerRedistribute(book: Book): void {
  if (book._reflow) {
    book._reflow.request();
  } else if (book._sourceText) {
    runDistribute(book);
  }
}

// 現在 N に対し、 全 variant obstacle の page 配置 / grid 座標 / display を解決する。
function resolveVariantsForBook(book: Book): void {
  const n = book.columns;
  for (const obstacle of book._variantObstacles) {
    if (!obstacle.whenColumns) continue;
    const variant = obstacle.whenColumns[n];
    if (!variant) {
      detachVariantObstacle(obstacle);
      continue;
    }
    const targetPageIndex = variant.page - 1;
    if (targetPageIndex < 0 || targetPageIndex >= book.pages.length) {
      // 該当 page が未生成なら degrade (graceful)。
      detachVariantObstacle(obstacle);
      continue;
    }
    const targetPage = book.pages[targetPageIndex];
    attachVariantObstacle(obstacle, targetPage, variant, n);
  }
}

// variant 適用: 対象 page の obstacle-layer に move し、 grid 座標と data 属性を更新する。
function attachVariantObstacle(
  obstacle: Obstacle,
  page: Page,
  variant: WhenColumnsVariant,
  n: number,
): void {
  const el = obstacle.element;
  el.style.display = '';
  el.style.gridColumn = `${variant.at.col} / span ${variant.cols}`;
  el.style.gridRow = `${variant.at.line} / span ${variant.lines}`;
  el.dataset.whenColumns = String(n);
  // page をまたいで移動した場合、 元 page の obstacles 配列から取り除いて新 page に登録し直す。
  if (obstacle.currentPage && obstacle.currentPage !== page) {
    const prev = obstacle.currentPage;
    const idx = prev.obstacles.indexOf(obstacle);
    if (idx >= 0) prev.obstacles.splice(idx, 1);
    for (const f of obstacle.floats) f.remove();
    obstacle.floats.length = 0;
  }
  if (el.parentElement !== page.obstacleLayer) {
    page.obstacleLayer.appendChild(el);
  }
  if (!page.obstacles.includes(obstacle)) {
    page.obstacles.push(obstacle);
  }
  // legacy 経路の colRange / rowRange を variant 値で同期 (reflowObstacles では使われないが
  // public な Obstacle 型の整合のため埋める)。
  obstacle.colRange = [variant.at.col, variant.at.col + variant.cols];
  obstacle.rowRange = [variant.at.line, variant.at.line + variant.lines];
  obstacle.currentPage = page;
}

// variant 未定義 N の degrade 処理: display:none にし、 page から取り外す。
function detachVariantObstacle(obstacle: Obstacle): void {
  const el = obstacle.element;
  el.style.display = 'none';
  el.dataset.whenColumns = '';
  for (const f of obstacle.floats) f.remove();
  obstacle.floats.length = 0;
  if (obstacle.currentPage) {
    const idx = obstacle.currentPage.obstacles.indexOf(obstacle);
    if (idx >= 0) obstacle.currentPage.obstacles.splice(idx, 1);
    obstacle.currentPage = undefined;
  }
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

// viewport から現在 N を導出するモード共通の resolver。
// 固定 N: 値そのまま / width: 段幅から実数導出 / supported: 離散スナップ。
function resolveColumnsForConfig(book: Book, config: ColumnsConfig): number {
  if (isFixedNumberMode(config)) return config;
  if (isSupportedMode(config)) return deriveColumnsFromSupported(book, config);
  return deriveColumnsFromWidth(book, config);
}

// supportedColumns + breakpoints から N を導出する。
// 1. breakpoints の値を px に解決
// 2. viewport inline-size >= threshold を満たすうち最大の N を選ぶ
// 3. 該当なしなら supported の最小値にフォールバック (下スナップ)
//
// 比較対象は viewport 全体 (CSS の `@media (min-width: ...)` と同じ意味論)。
// page / flow-layer の inline-size ではなく window の inline 軸サイズを使う。
function deriveColumnsFromSupported(
  book: Book,
  config: { supported: number[]; breakpoints: Record<number, string> },
): number {
  if (config.supported.length === 0) return 1;
  const minN = Math.min(...config.supported);
  const win = book.root.ownerDocument.defaultView ?? window;
  const inlineSize = book.writingMode === 'vertical-rl' ? win.innerHeight : win.innerWidth;
  if (!Number.isFinite(inlineSize) || inlineSize <= 0) return minN;
  // 各 supported N の threshold を px 化し、 viewport >= threshold を満たすものを集める。
  const candidates: Array<{ n: number; px: number }> = [];
  for (const n of config.supported) {
    const literal = config.breakpoints[n];
    if (literal === undefined) continue;
    const px = resolveCssLengthToPx(book.root, literal);
    if (!Number.isFinite(px)) continue;
    if (inlineSize >= px) candidates.push({ n, px });
  }
  if (candidates.length === 0) return minN;
  // threshold が同点なら N が大きい方を優先 (より多段に倒す)。
  candidates.sort((a, b) => b.n - a.n);
  return candidates[0].n;
}

// 固定 N 以外の全モードで reflow ごとに N を再計算し、全 page の column 要素数を揃える。
function updateColumnsForViewport(book: Book): void {
  if (isFixedNumberMode(book.columnsConfig)) return;
  const n = resolveColumnsForConfig(book, book.columnsConfig);
  if (n === book.columns) {
    // N 変化なしでも root の data-active-columns は念のため同期させる。
    book.root.dataset.activeColumns = String(n);
    return;
  }
  book.columns = n;
  applyColumnsToRoot(book.root, book.columnsConfig, n);
  book.root.dataset.activeColumns = String(n);
  for (const page of book.pages) {
    syncColumnElementsTo(page.flowLayer, page.columnElements, n);
  }
}

function runDistribute(book: Book): void {
  // 固定 N 以外では page inline サイズが変わると N が変動する。
  // distribute 前に column 要素数を最新 viewport に合わせ直す。
  updateColumnsForViewport(book);
  // 行高は CSS Grid の auto-fill row 単位として CSS 変数で流す。 変数の値は単位なし数値で、
  // CSS 側で calc 経由で長さ単位に変換する (src 側に長さ文字列を書かない方針)。
  syncLineHeightVar(book);

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

  // variant 解決を distribute 前に走らせ、 variant obstacle を該当 page に attach する。
  // distribute の trimPagesAfter は obstacle を持つ page を保持するため、 attach 済みなら
  // page=2 等の variant が消えない。
  resolveVariantsForBook(book);
  distribute(host, graphemes, projection);
  // distribute 後に page 数が変わった場合に備えて再解決 (足りなかった page が増えていれば再 attach)。
  resolveVariantsForBook(book);
  // 再分配で obstacle の column 内交差も変動するため、各 page の float も再計算する。
  for (const page of book.pages) reflowObstacles(page);
}

// flow-text の line-height を実測し、 book.root に CSS 変数として書き込む。
// CSS 側で calc 経由の単位変換を行うため、 ここでは単位なし数値だけを set する。
function syncLineHeightVar(book: Book): void {
  if (book.pages.length === 0) return;
  const projection = axisProjection(book.writingMode);
  const probe = book.pages[0].flowLayer;
  const lh = measureLineHeight(probe, projection);
  if (!Number.isFinite(lh) || lh <= 0) return;
  // 単位なし数値として保存する (単位は CSS 側で calc 経由で付与する)。
  book.root.style.setProperty('--tilepage-line-height', String(lh));
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
