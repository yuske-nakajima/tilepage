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
  // addObstacleHorizontal/Vertical(book, ...) で登録された whenColumns 持ち obstacle 群。
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

// 段数 N が一致した時に採用される配置 variant (内部表現)。
// at.col / at.line は 1-indexed。 line は obstacle-layer の auto-fill row index。
// 縦書き variant は内部でこの形式に正規化される (at.row→line, at.char→col, rows→lines, chars→cols)。
// lines / aspect の解決優先順位:
//   1. aspect 指定あり → cols から lines を導出 (lines も指定されていれば warn して aspect 優先)
//   2. aspect 未指定で lines 指定 → そのまま
//   3. 両方未指定 → 画像 natural aspect (img.naturalWidth / img.naturalHeight) から導出
//      画像以外 / natural が取れない場合は FALLBACK_LINES (= 4)
export interface WhenColumnsVariant {
  page: number;
  at: { col: number; line: number };
  cols: number;
  lines?: number;
  // 'W/H' (例: '3/4', '16/9')。 W, H は正の数値文字列。 パース失敗は warn して未指定扱い。
  aspect?: string;
}

// 公開 API: 横書き variant。 cols=段組み相対の幅 (grid-column span)。
export interface HorizontalWhenColumnsVariant {
  page: number;
  at: { col: number; line: number };
  cols: number;
  lines?: number;
  aspect?: string;
}

// 公開 API: 縦書き variant。 rows=段組み相対の高さ (内部で grid-row span にマップされる)。
// field 名を `cols/lines` から `rows/chars` に変えることで axis swap を型レベルで強制する。
export interface VerticalWhenColumnsVariant {
  page: number;
  at: { row: number; char: number };
  rows: number;
  chars?: number;
  aspect?: string;
}

export interface BaseObstacleOptions {
  shape?: ObstacleShape;
  src?: string;
  alt?: string;
  element?: HTMLElement;
  shapeMargin?: string;
  syncClipPath?: boolean;
}

export interface HorizontalObstacleOptions extends BaseObstacleOptions {
  whenColumns: Partial<Record<number, HorizontalWhenColumnsVariant>>;
}

export interface VerticalObstacleOptions extends BaseObstacleOptions {
  whenColumns: Partial<Record<number, VerticalWhenColumnsVariant>>;
}

// 内部用 (legacy page-level path / 正規化後形)。 公開 API ではない。
export interface ObstacleOptions {
  at?: GridPos;
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

// 公開 API: 横書き専用 obstacle 配置。
// whenColumns 経路で、 段数 N と一致する variant が選ばれる。
// 未一致 N では obstacle が display:none で隠れる (graceful degradation)。
export function addObstacleHorizontal(book: Book, options: HorizontalObstacleOptions): Obstacle {
  if (!options.whenColumns) {
    throw new Error('addObstacleHorizontal(book, ...): options.whenColumns is required');
  }
  const internal: ObstacleOptions = {
    ...options,
    whenColumns: normalizeHorizontalWhenColumns(options.whenColumns),
  };
  return addObstacleToBook(book, internal);
}

// 公開 API: 縦書き専用 obstacle 配置。
// at.row / at.char / rows / chars を内部 grid に物理 swap してマップする。
export function addObstacleVertical(book: Book, options: VerticalObstacleOptions): Obstacle {
  if (!options.whenColumns) {
    throw new Error('addObstacleVertical(book, ...): options.whenColumns is required');
  }
  const internal: ObstacleOptions = {
    ...options,
    whenColumns: normalizeVerticalWhenColumns(options.whenColumns),
  };
  return addObstacleToBook(book, internal);
}

// 縦書き public variant 群を内部 WhenColumnsVariant 形式に正規化する。
// API 層の axis swap 吸収はここで行う:
//   at.row  → at.line       (段組み相対 = grid-row-start)
//   at.char → at.col        (文字位置  = grid-column-start)
//   rows    → cols          (= grid-row span)   ※ 「段組み相対の高さ」
//   chars   → lines         (= grid-column span)※ 「幅」 (省略時 aspect/natural から導出)
// 注意: 内部 WhenColumnsVariant の cols/lines は CSS span に直結する物理座標であり、
// 縦書きの「段組み相対の高さ」を rows、「幅」を chars に対応させる。
// 縦書きの reflow / clamp 計算は内部 cols/lines を grid 物理軸として扱うので、
// "縦書きの cols" は内部 cols = grid-column span (= 文字幅方向) になることに注意。
function normalizeVerticalWhenColumns(
  whenColumns: Partial<Record<number, VerticalWhenColumnsVariant>>,
): Record<number, WhenColumnsVariant> {
  const out: Record<number, WhenColumnsVariant> = {};
  for (const key of Object.keys(whenColumns)) {
    const n = Number.parseInt(key, 10);
    const v = whenColumns[n];
    if (!v) continue;
    // 縦書き: rows が段組み相対の「block 軸 (横方向 right→left)」 span。
    //         chars が「inline 軸 (縦方向 top→bottom)」 span。
    // 内部 WhenColumnsVariant は cols=grid-column span, lines=grid-row span を意味する。
    // 物理 grid-row = 縦方向 = inline 軸 (chars) → lines = chars
    // 物理 grid-column = 横方向 = block 軸 (rows) → cols = rows
    // つまり 内部 cols ← v.rows, 内部 lines ← v.chars。 at.col ← v.at.row, at.line ← v.at.char。
    // (v.at.row は段組み相対 row 番号 = 物理 grid-column-start に流れる)
    out[n] = {
      page: v.page,
      at: { col: v.at.row, line: v.at.char },
      cols: v.rows,
      lines: v.chars,
      aspect: v.aspect,
    };
  }
  return out;
}

// 横書き public variant 群を内部形式に正規化する (field 名一致のため shallow copy)。
function normalizeHorizontalWhenColumns(
  whenColumns: Partial<Record<number, HorizontalWhenColumnsVariant>>,
): Record<number, WhenColumnsVariant> {
  const out: Record<number, WhenColumnsVariant> = {};
  for (const key of Object.keys(whenColumns)) {
    const n = Number.parseInt(key, 10);
    const v = whenColumns[n];
    if (!v) continue;
    out[n] = v;
  }
  return out;
}

function addObstacleToBook(book: Book, options: ObstacleOptions): Obstacle {
  if (!options.whenColumns) {
    throw new Error('addObstacleHorizontal/Vertical: options.whenColumns is required');
  }
  if (options.at) {
    throw new Error(
      'addObstacleHorizontal/Vertical: options.at must not be combined with whenColumns',
    );
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
        // 画像ロード後は natural aspect が取れるので variant を解決し直す。
        // resolveVariantsForBook 経由で grid-row span が更新され、 reflow も連動する。
        resolveVariantsForBook(book);
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
  const pageCount = book.pages.length;
  for (const obstacle of book._variantObstacles) {
    if (!obstacle.whenColumns) continue;
    const variant = obstacle.whenColumns[n];
    if (!variant) {
      detachVariantObstacle(obstacle);
      continue;
    }
    // page を [1, pageCount] に clamp する。pageCount === 0 ならアタッチ不能なので degrade。
    if (pageCount === 0) {
      detachVariantObstacle(obstacle);
      continue;
    }
    const pageReasons: string[] = [];
    let resolvedPage = variant.page;
    if (resolvedPage < 1) {
      pageReasons.push(`page:${variant.page}->1`);
      resolvedPage = 1;
    } else if (resolvedPage > pageCount) {
      pageReasons.push(`page:${variant.page}->${pageCount}`);
      resolvedPage = pageCount;
    }
    const targetPage = book.pages[resolvedPage - 1];
    attachVariantObstacle(obstacle, targetPage, variant, n, pageReasons);
  }
}

// aspect 未解決時のフォールバック行数。 画像 natural aspect が取れない / 画像以外の DOM 用。
const FALLBACK_LINES = 4;

// 'W/H' を { w, h } にパース。 失敗時は undefined。
function parseAspect(aspect: string): { w: number; h: number } | undefined {
  const m = aspect.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
  if (!m) return undefined;
  const w = Number.parseFloat(m[1]);
  const h = Number.parseFloat(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
  return { w, h };
}

interface ResolveLinesContext {
  // cell の inline 軸 size を構成する 1 段あたりの実 px と、 段間 gap の実 px。
  // cellWidth = cols * columnWidthPx + (cols - 1) * gutterPx
  columnWidthPx: number;
  gutterPx: number;
  lineHeightPx: number;
  // 画像要素なら naturalWidth/Height を渡す。 未ロード / 画像以外なら undefined。
  imgIntrinsic?: { w: number; h: number };
}

// variant.aspect / variant.lines / 画像 natural aspect の優先順位で行数を決定する。
// 戻り値は常に >= 1 の整数。
function resolveLines(variant: WhenColumnsVariant, ctx: ResolveLinesContext): number {
  const cellWidth = variant.cols * ctx.columnWidthPx + (variant.cols - 1) * ctx.gutterPx;
  // 1. aspect 指定あり → cols から lines を導出。
  if (variant.aspect !== undefined) {
    const parsed = parseAspect(variant.aspect);
    if (parsed) {
      if (variant.lines !== undefined) {
        console.warn(
          `[tilepage] WhenColumnsVariant: both 'aspect' (${variant.aspect}) and 'lines' (${variant.lines}) given; 'aspect' is preferred`,
        );
      }
      if (ctx.lineHeightPx > 0 && cellWidth > 0) {
        const cellHeight = (cellWidth * parsed.h) / parsed.w;
        return Math.max(1, Math.round(cellHeight / ctx.lineHeightPx));
      }
    } else {
      console.warn(
        `[tilepage] WhenColumnsVariant: invalid aspect '${variant.aspect}'; expected 'W/H' (e.g. '3/4'). Falling back to 'lines' or natural aspect.`,
      );
    }
  }
  // 2. lines 指定 → そのまま。
  if (variant.lines !== undefined && variant.lines >= 1) {
    return Math.max(1, Math.floor(variant.lines));
  }
  // 3. 画像 natural aspect 経由。
  if (ctx.imgIntrinsic && ctx.lineHeightPx > 0 && cellWidth > 0) {
    const cellHeight = (cellWidth * ctx.imgIntrinsic.h) / ctx.imgIntrinsic.w;
    return Math.max(1, Math.round(cellHeight / ctx.lineHeightPx));
  }
  // 4. 画像未ロード or 画像以外。 fallback でとりあえず描画させる。
  return FALLBACK_LINES;
}

// 要素から ResolveLinesContext を組み立てる。 px の生成元は computed style のみで、
// JS 内に物理長リテラルを書かない (評価軸 #4)。
function buildResolveLinesContext(book: Book, page: Page): ResolveLinesContext {
  const probe = page.flowLayer;
  const cs = getComputedStyle(probe);
  const projection = axisProjection(book.writingMode);
  // 1 column の inline 軸 size = 全段の inline / N。 padding は除外。
  const inlineSize = inlineSizeOfElement(probe, book.writingMode);
  const gutterPx = resolveCssLengthToPx(
    book.root,
    cs.getPropertyValue('--tilepage-gutter').trim() || '1em',
  );
  const safeGutter = Number.isFinite(gutterPx) && gutterPx > 0 ? gutterPx : 0;
  const n = Math.max(1, book.columns);
  // N 段 + (N-1) gap = inlineSize  ⇒  columnWidth = (inlineSize - (N-1)*gutter) / N
  const columnWidthPx = Math.max(0, (inlineSize - (n - 1) * safeGutter) / n);
  // line-height: 単位なし数値が --tilepage-line-height に書き込まれている。 fallback で flow-text を実測。
  const lhVar = Number.parseFloat(cs.getPropertyValue('--tilepage-line-height').trim());
  const lineHeightPx =
    Number.isFinite(lhVar) && lhVar > 0 ? lhVar : measureLineHeight(probe, projection);
  return {
    columnWidthPx,
    gutterPx: safeGutter,
    lineHeightPx,
    // imgIntrinsic は呼び出し側で obstacle ごとに付与する。
  };
}

// 内部 helper のテスト用エクスポート。 公開 API ではない (`_` prefix)。
export const _internalAspect = {
  parseAspect,
  resolveLines,
  FALLBACK_LINES,
};

// 画像 element から naturalWidth/Height を取り出す。 未ロード or 画像でない場合 undefined。
function getImgIntrinsic(el: HTMLElement): { w: number; h: number } | undefined {
  if (el.tagName !== 'IMG') return undefined;
  const img = el as HTMLImageElement;
  if (!img.complete) return undefined;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
  return { w, h };
}

// variant 適用: 対象 page の obstacle-layer に move し、 grid 座標と data 属性を更新する。
// 範囲外の at.col / at.line / cols / lines / page は clamp し、 発生理由を element.dataset と
// console.warn に残す。
function attachVariantObstacle(
  obstacle: Obstacle,
  page: Page,
  variant: WhenColumnsVariant,
  n: number,
  pageReasons: ReadonlyArray<string> = [],
): void {
  const el = obstacle.element;
  el.style.display = '';
  const baseCtx = buildResolveLinesContext(page.book, page);
  const resolvedLines = resolveLines(variant, {
    ...baseCtx,
    imgIntrinsic: getImgIntrinsic(el),
  });
  const projection = axisProjection(page.book.writingMode);
  // obstacle-layer の content area (padding を引いた領域) を基準に maxLines を出す。
  // padding は createBook の宣言値が CSS 変数経由で obstacle-layer に効いている。
  // padding 込みで計算すると clamp が page 端まで占有して余白がなくなるため、 logical
  // padding-block を引いた content 領域で「下辺を maxLine に合わせる」挙動にする。
  const layerCs = getComputedStyle(page.obstacleLayer);
  const padBlockStart = Number.parseFloat(layerCs.paddingBlockStart) || 0;
  const padBlockEnd = Number.parseFloat(layerCs.paddingBlockEnd) || 0;
  const layerBlockSize = projection.blockSizeOf(page.obstacleLayer);
  const contentBlockSize = Math.max(0, layerBlockSize - padBlockStart - padBlockEnd);
  const maxLines =
    baseCtx.lineHeightPx > 0 && contentBlockSize > 0
      ? Math.max(1, Math.floor(contentBlockSize / baseCtx.lineHeightPx))
      : Number.POSITIVE_INFINITY;
  const clamped = clampVariantPlacement(variant, resolvedLines, n, maxLines);
  el.style.gridColumn = `${clamped.col} / span ${clamped.cols}`;
  el.style.gridRow = `${clamped.line} / span ${clamped.lines}`;
  el.dataset.whenColumns = String(n);
  const allReasons = [...pageReasons, ...clamped.reasons];
  if (allReasons.length > 0) {
    el.dataset.clampReasons = allReasons.join(',');
    console.warn('[tilepage] variant clamped', {
      obstacleId: el.dataset.id ?? el.id ?? '(unnamed)',
      n,
      declared: variant,
      resolved: {
        page:
          pageReasons.find((r) => r.startsWith('page:'))?.split('->')[1] ?? String(variant.page),
        col: clamped.col,
        line: clamped.line,
        cols: clamped.cols,
        lines: clamped.lines,
      },
      reasons: allReasons,
    });
  } else if (el.dataset.clampReasons !== undefined) {
    delete el.dataset.clampReasons;
  }
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
  // legacy 経路の colRange / rowRange を clamp 後の値で同期する。
  obstacle.colRange = [clamped.col, clamped.col + clamped.cols];
  obstacle.rowRange = [clamped.line, clamped.line + clamped.lines];
  obstacle.currentPage = page;
}

// at.col / at.line / cols / lines を [1, max] に clamp する。
// 下辺 / 右端を max に合わせる方向で line / col の起点を引き戻すので、 over 宣言時に
// 画像の底 (block-end) と右端 (inline-end) が page / column の最大値に揃う。
function clampVariantPlacement(
  variant: WhenColumnsVariant,
  resolvedLines: number,
  n: number,
  maxLines: number,
): { col: number; line: number; cols: number; lines: number; reasons: string[] } {
  const reasons: string[] = [];
  let cols = variant.cols;
  if (cols < 1) {
    reasons.push(`cols:${variant.cols}->1`);
    cols = 1;
  } else if (cols > n) {
    reasons.push(`cols:${variant.cols}->${n}`);
    cols = n;
  }
  let col = variant.at.col;
  if (col < 1) {
    reasons.push(`at.col:${variant.at.col}->1`);
    col = 1;
  } else if (col + cols - 1 > n) {
    const next = Math.max(1, n - cols + 1);
    reasons.push(`at.col:${variant.at.col}->${next}`);
    col = next;
  }
  let lines = resolvedLines;
  if (lines < 1) {
    reasons.push(`lines:${resolvedLines}->1`);
    lines = 1;
  } else if (Number.isFinite(maxLines) && lines > maxLines) {
    reasons.push(`lines:${resolvedLines}->${maxLines}`);
    lines = maxLines;
  }
  let line = variant.at.line;
  if (line < 1) {
    reasons.push(`at.line:${variant.at.line}->1`);
    line = 1;
  } else if (Number.isFinite(maxLines) && line + lines - 1 > maxLines) {
    const next = Math.max(1, maxLines - lines + 1);
    reasons.push(`at.line:${variant.at.line}->${next}`);
    line = next;
  }
  return { col, line, cols, lines, reasons };
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

// 横書きの 2 分割 float (左半分: float-left / 右半分: float-right) を生成する helper。
// halfXInPage / halfWidthPx は分割後の float box の column 内 page-relative 領域。
function createHorizontalHalfFloat(
  halfPolygon: Point[],
  columnBox: Rect,
  halfXInPage: number,
  halfWidthPx: number,
  blockSizeRatio: number,
  side: 'left' | 'right',
  shapeMargin: string,
): HTMLElement {
  const floatHeightPx = columnBox.height * blockSizeRatio;
  const floatOriginX = halfXInPage;
  const floatOriginY = columnBox.y;
  const inlineRatio = columnBox.width > 0 ? halfWidthPx / columnBox.width : 0;
  const localPoints =
    halfWidthPx > 0 && floatHeightPx > 0
      ? halfPolygon
          .map(([x, y]) => {
            const lx = ((x - floatOriginX) / halfWidthPx) * 100;
            const ly = ((y - floatOriginY) / floatHeightPx) * 100;
            return `${lx.toFixed(4)}% ${ly.toFixed(4)}%`;
          })
          .join(', ')
      : '';
  const el = document.createElement('div');
  el.className = 'tilepage-obstacle-float';
  el.style.float = side;
  el.style.inlineSize = `${(inlineRatio * 100).toFixed(4)}%`;
  el.style.blockSize = `${(blockSizeRatio * 100).toFixed(4)}%`;
  if (localPoints) el.style.shapeOutside = `polygon(${localPoints})`;
  el.style.shapeMargin = shapeMargin;
  return el;
}

// 縦書き (vertical-rl) の 2 分割 float helper。
// inline 軸 = 縦方向、 block 軸 = 横方向 (右→左) なので、 横書きの X 軸 split を Y 軸 split に置き換える。
// - 上半分 (float:right): inline-start (column 上端) の block-start (右端) corner
// - 下半分 (float:left):  inline-end   (column 下端) の block-start (右端) corner
// shape の block 軸方向の覆い範囲 (= 横方向の polygon 幅) を blockSize ratio として渡す。
function createVerticalHalfFloat(
  halfPolygon: Point[],
  columnBox: Rect,
  halfYInPage: number,
  halfHeightPx: number,
  blockSizeRatio: number,
  side: 'top' | 'bottom',
  shapeMargin: string,
): HTMLElement {
  // vertical-rl の block 軸 = 横方向。 float box の物理 width = column.width * blockSizeRatio。
  const floatWidthPx = columnBox.width * blockSizeRatio;
  // shape は column の右端 (block-start) に貼り付くので、 float box の物理 origin X は
  // column 右端から floatWidthPx 戻った位置。
  const floatOriginX = columnBox.x + columnBox.width - floatWidthPx;
  const floatOriginY = halfYInPage;
  const inlineRatio = columnBox.height > 0 ? halfHeightPx / columnBox.height : 0;
  const localPoints =
    halfHeightPx > 0 && floatWidthPx > 0
      ? halfPolygon
          .map(([x, y]) => {
            const lx = ((x - floatOriginX) / floatWidthPx) * 100;
            const ly = ((y - floatOriginY) / halfHeightPx) * 100;
            return `${lx.toFixed(4)}% ${ly.toFixed(4)}%`;
          })
          .join(', ')
      : '';
  const el = document.createElement('div');
  el.className = 'tilepage-obstacle-float';
  // vertical-rl では float:right = inline-start (top) / float:left = inline-end (bottom)。
  el.style.float = side === 'top' ? 'right' : 'left';
  // CSS の inline-size は writing-mode に従う。 vertical-rl では inline = 縦方向。
  el.style.inlineSize = `${(inlineRatio * 100).toFixed(4)}%`;
  el.style.blockSize = `${(blockSizeRatio * 100).toFixed(4)}%`;
  if (localPoints) el.style.shapeOutside = `polygon(${localPoints})`;
  el.style.shapeMargin = shapeMargin;
  return el;
}

function reflowObstacles(page: Page): void {
  for (const obstacle of page.obstacles) {
    for (const f of obstacle.floats) f.remove();
    obstacle.floats.length = 0;
  }

  // line-height は CSS 変数で book.root に保持されている。 column 底に 1 行未満の
  // residual が残ると text が overflow:hidden で滲み出すため、 float の block-size を
  // 延長して埋めるのに使う。
  const rootCs = getComputedStyle(page.book.root);
  const lhVar = Number.parseFloat(rootCs.getPropertyValue('--tilepage-line-height').trim());
  const lineHeightPx = Number.isFinite(lhVar) && lhVar > 0 ? lhVar : 0;

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

      const polygonBottomY = Math.max(...clipped.map(([, y]) => y));
      const columnBottomY = columnBox.y + columnBox.height;
      const residualBottom = columnBottomY - polygonBottomY;
      const fillResidual = lineHeightPx > 0 && residualBottom > 0 && residualBottom < lineHeightPx;

      if (floatSide === 'left') {
        // horizontal-tb: 非矩形 shape の bounding rect 左側 corner にも text を流すため、
        // clipped polygon を縦中央で 2 分割し、 float-left + float-right の対で inject する。
        // 各 float の polygon は shape の半分を覆い、 反対側の corner は polygon 外なので
        // shape-outside 仕様に従い text が流れる。
        const minX = Math.min(...clipped.map(([x]) => x));
        const maxX = Math.max(...clipped.map(([x]) => x));
        const centerX = (minX + maxX) / 2;

        const leftRect: Rect = {
          x: columnBox.x,
          y: columnBox.y,
          width: centerX - columnBox.x,
          height: columnBox.height,
        };
        const rightRect: Rect = {
          x: centerX,
          y: columnBox.y,
          width: columnBox.x + columnBox.width - centerX,
          height: columnBox.height,
        };

        const leftHalf = clipPolygonByRect(clipped, leftRect);
        const rightHalf = clipPolygonByRect(clipped, rightRect);

        const blockSizeRatio =
          columnBox.height > 0 ? (polygonBottomY - columnBox.y) / columnBox.height : 0;

        // anchor を固定して順次 insertBefore することで、 DOM 順を [leftFloat, rightFloat, spacer]
        // に保つ。CSS float は DOM 順に処理されるので、 同じ row で leftFloat(左) + rightFloat(右)
        // が並び、 spacer (full-width float-left) は次 row に追いやられる。
        const anchor = col.firstChild;
        if (leftHalf.length >= 3 && leftRect.width > 0) {
          const f = createHorizontalHalfFloat(
            leftHalf,
            columnBox,
            leftRect.x,
            leftRect.width,
            blockSizeRatio,
            'left',
            obstacle.shapeMargin,
          );
          col.insertBefore(f, anchor);
          obstacle.floats.push(f);
        }
        if (rightHalf.length >= 3 && rightRect.width > 0) {
          const f = createHorizontalHalfFloat(
            rightHalf,
            columnBox,
            rightRect.x,
            rightRect.width,
            blockSizeRatio,
            'right',
            obstacle.shapeMargin,
          );
          col.insertBefore(f, anchor);
          obstacle.floats.push(f);
        }
        if (fillResidual) {
          // column 底に 1 行未満の隙間が残る時、shape を持たない full-width spacer を最後に
          // inject して text が滲み出すのを防ぐ。 anchor の前に挿入することで [left, right, spacer]
          // の DOM 順を保つ。
          const spacer = document.createElement('div');
          spacer.className = 'tilepage-obstacle-float';
          spacer.style.float = 'left';
          spacer.style.inlineSize = '100%';
          spacer.style.blockSize = `${((residualBottom / columnBox.height) * 100).toFixed(4)}%`;
          col.insertBefore(spacer, anchor);
          obstacle.floats.push(spacer);
        }
      } else {
        // vertical-rl: 横書きの 2 分割 + spacer 構造を block 軸 (上下) に swap した縦書きルート。
        // inline 軸 = 縦方向 (top→bottom)、 block 軸 = 横方向 (right→left)。
        // 横書きで X 軸中央で polygon を 2 分割 (left/right half) したのを、
        // 縦書きでは Y 軸中央で 2 分割 (top/bottom half) する。
        // 各 half float は block 軸方向 (= 横方向) に shape の覆い幅を持ち、
        // shape-outside で text が上半/下半それぞれの周囲を流れる。
        const minY = Math.min(...clipped.map(([, y]) => y));
        const maxY = Math.max(...clipped.map(([, y]) => y));
        const centerY = (minY + maxY) / 2;

        // 上半分 = 縦軸の inline-start (= 列の上端) 〜 centerY。
        const topRect: Rect = {
          x: columnBox.x,
          y: columnBox.y,
          width: columnBox.width,
          height: centerY - columnBox.y,
        };
        // 下半分 = centerY 〜 inline-end (= 列の下端)。
        const bottomRect: Rect = {
          x: columnBox.x,
          y: centerY,
          width: columnBox.width,
          height: columnBox.y + columnBox.height - centerY,
        };

        const topHalf = clipPolygonByRect(clipped, topRect);
        const bottomHalf = clipPolygonByRect(clipped, bottomRect);

        // shape が block 軸 (= 横方向) で占有する column 内の比率。
        // 縦書きの「block-end」は左端なので、 polygon leftmost X から column 右端までが占有幅。
        const polygonLeftX = Math.min(...clipped.map(([x]) => x));
        const blockSizeRatio =
          columnBox.width > 0
            ? (columnBox.x + columnBox.width - polygonLeftX) / columnBox.width
            : 0;
        // 縦書きの residual = polygon 左端 (block-end) と column 左端の隙間 (1 行未満なら spacer 化)。
        const residualLeft = polygonLeftX - columnBox.x;
        const fillResidualVertical =
          lineHeightPx > 0 && residualLeft > 0 && residualLeft < lineHeightPx;

        // DOM 順: [topFloat (float:right), bottomFloat (float:left), spacer (float:right)]。
        // float:right は inline-start (top) に、 float:left は inline-end (bottom) に attach する。
        // spacer は block 軸方向に余り分を埋めるため block-size 100% の float:right で挿入する。
        const anchor = col.firstChild;
        if (topHalf.length >= 3 && topRect.height > 0) {
          const f = createVerticalHalfFloat(
            topHalf,
            columnBox,
            topRect.y,
            topRect.height,
            blockSizeRatio,
            'top',
            obstacle.shapeMargin,
          );
          col.insertBefore(f, anchor);
          obstacle.floats.push(f);
        }
        if (bottomHalf.length >= 3 && bottomRect.height > 0) {
          const f = createVerticalHalfFloat(
            bottomHalf,
            columnBox,
            bottomRect.y,
            bottomRect.height,
            blockSizeRatio,
            'bottom',
            obstacle.shapeMargin,
          );
          col.insertBefore(f, anchor);
          obstacle.floats.push(f);
        }
        if (fillResidualVertical) {
          // 横方向の residual を埋める spacer。 inline-size (= 縦方向) 100% で float:right。
          const spacer = document.createElement('div');
          spacer.className = 'tilepage-obstacle-float';
          spacer.style.float = 'right';
          spacer.style.inlineSize = '100%';
          spacer.style.blockSize = `${((residualLeft / columnBox.width) * 100).toFixed(4)}%`;
          col.insertBefore(spacer, anchor);
          obstacle.floats.push(spacer);
        }
      }
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
