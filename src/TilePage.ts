import { axisProjection, type WritingMode } from './flow/axis';
import { splitGraphemes } from './flow/chunk';
import { distribute, type FlowHost, type FlowWindow } from './flow/distribute';
import { measureLineHeight } from './flow/measure';
import { createReflowController, type ReflowController } from './flow/reflow';
import { resolveVariantsForBook } from './obstacles/internal';
import type { Obstacle } from './obstacles/obstacle';
import { injectStyles } from './styles/inject';
import { clipPolygonByRect, type Point, type Rect } from './utils/polygon';

export type { WritingMode } from './flow/axis';
// obstacle 系の公開 API / 型は src/obstacles/ 配下に物理分割されている。
// 既存利用者の import path 互換を維持するため、 TilePage.ts 経由で re-export する。
export {
  _internalAspect,
  addBoxHorizontal,
  addHeadlineHorizontal,
  addObstacleHorizontal,
  addObstacleVertical,
  addPullquoteHorizontal,
  type BaseObstacleOptions,
  type BoxHorizontalOptions,
  type HeadlineHorizontalOptions,
  type HorizontalObstacleOptions,
  type HorizontalWhenColumnsVariant,
  type Obstacle,
  type ObstacleOptions,
  type PullquoteHorizontalOptions,
  type VerticalObstacleOptions,
  type VerticalWhenColumnsVariant,
  type WhenColumnsVariant,
} from './obstacles/index';

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

export function inlineSizeOfElement(el: HTMLElement, writingMode: WritingMode): number {
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
export function resolveCssLengthToPx(context: HTMLElement, value: string): number {
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

export function runDistribute(book: Book): void {
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

// 2 分割 float (block 軸 start 寄せ / end 寄せ) を生成する helper。
// 引数の rect / polygon はいずれも page 相対の物理 px 座標。
// originPhysX / originPhysY は float box の物理左上 (page 相対)。
// boxPhysWidth / boxPhysHeight は float box の物理サイズ。
// `inlineSize` / `blockSize` は CSS logical プロパティ。 horizontal-tb では inline=幅 / block=高、
// vertical-rl では inline=高 / block=幅 になり、 polygon shape-outside の % は float box の
// 物理サイズに対する % として解釈される (CSS Shapes 仕様)。
function createHalfFloat(
  halfPolygon: Point[],
  originPhysX: number,
  originPhysY: number,
  boxPhysWidth: number,
  boxPhysHeight: number,
  inlineSizePercent: number,
  blockSizePercent: number,
  side: 'left' | 'right',
  shapeMargin: string,
): HTMLElement {
  const localPoints =
    boxPhysWidth > 0 && boxPhysHeight > 0
      ? halfPolygon
          .map(([x, y]) => {
            const lx = ((x - originPhysX) / boxPhysWidth) * 100;
            const ly = ((y - originPhysY) / boxPhysHeight) * 100;
            return `${lx.toFixed(4)}% ${ly.toFixed(4)}%`;
          })
          .join(', ')
      : '';
  const el = document.createElement('div');
  el.className = 'tilepage-obstacle-float';
  el.style.float = side;
  el.style.inlineSize = `${inlineSizePercent.toFixed(4)}%`;
  el.style.blockSize = `${blockSizePercent.toFixed(4)}%`;
  if (localPoints) el.style.shapeOutside = `polygon(${localPoints})`;
  el.style.shapeMargin = shapeMargin;
  return el;
}

// 物理 X/Y 軸 (left/right または top/bottom) を logical inline/block 軸へ抽象化する。
// horizontal-tb: inline = X (left→right) / block = Y (top→bottom)
// vertical-rl:   inline = Y (top→bottom) / block = X (right→left)
// half float の DOM 配置は inline-start / inline-end 寄せに対応する CSS float 値を返す。
// CSS float は writing-mode に依存して inline-start/end を解釈するため、
//   horizontal-tb: inline-start = 'left',  inline-end = 'right'
//   vertical-rl:   inline-start = 'right' (物理上), inline-end = 'left' (物理下)
interface LogicalAxisOps {
  // polygon の各 [x, y] (物理 px) から inline 座標を取り出す
  inlineOf(p: Point): number;
  // column 内の inline 中央を Box から計算
  inlineCenterOfPolygon(poly: Point[]): number;
  // half rect (inline-start 側 / inline-end 側) を物理 Rect として生成する。
  // 横書きでは inline=X 方向に左右、 縦書きでは inline=Y 方向に上下に分割する。
  startHalfRect(columnBox: Rect, inlineCenter: number): Rect;
  endHalfRect(columnBox: Rect, inlineCenter: number): Rect;
  // column の inline-size / block-size (物理 px)
  inlineSize(box: Rect): number;
  blockSize(box: Rect): number;
  // polygon の block 軸 end 座標 (column の block-start から最も遠い側)
  polygonBlockEndOf(poly: Point[]): number;
  // column の block-end 物理座標
  columnBlockEnd(box: Rect): number;
  // float の inline-start / inline-end 寄せ CSS float 値
  startFloat: 'left' | 'right';
  endFloat: 'left' | 'right';
  // float box の物理 origin (top-left の page 相対 px) を返す。
  // halfRect は startHalfRect/endHalfRect の戻り値、 polygonBlockSpan は float box の block 軸物理 px。
  // box の inline 軸 origin = halfRect の inline 軸 start、 box の block 軸 origin は
  //   横書き: column 上端 (block-start)、 box は block-start ↓ polygonBlockSpan を占有
  //   縦書き: column 右端 - polygonBlockSpan、 box は column block-start (物理右) から block-end (物理左) へ polygonBlockSpan を占有
  floatBoxOrigin(
    halfRect: Rect,
    columnBox: Rect,
    polygonBlockSpan: number,
  ): { x: number; y: number };
  // float box の物理サイズ (width / height)
  floatBoxSize(halfRect: Rect, polygonBlockSpan: number): { width: number; height: number };
}

function logicalOps(mode: WritingMode): LogicalAxisOps {
  if (mode === 'vertical-rl') {
    // 縦書き: inline = Y (上→下), block = X (右→左)
    // block-start = column 右端、 block-end = column 左端
    return {
      inlineOf: ([, y]) => y,
      inlineCenterOfPolygon(poly) {
        const ys = poly.map(([, y]) => y);
        return (Math.min(...ys) + Math.max(...ys)) / 2;
      },
      startHalfRect(columnBox, inlineCenter) {
        // inline-start = 物理上半分。 Y: [columnBox.y, inlineCenter]
        return {
          x: columnBox.x,
          y: columnBox.y,
          width: columnBox.width,
          height: inlineCenter - columnBox.y,
        };
      },
      endHalfRect(columnBox, inlineCenter) {
        // inline-end = 物理下半分。 Y: [inlineCenter, columnBox.y + columnBox.height]
        return {
          x: columnBox.x,
          y: inlineCenter,
          width: columnBox.width,
          height: columnBox.y + columnBox.height - inlineCenter,
        };
      },
      inlineSize: (box) => box.height,
      blockSize: (box) => box.width,
      polygonBlockEndOf: (poly) => Math.min(...poly.map(([x]) => x)),
      columnBlockEnd: (box) => box.x,
      // CSS Writing Modes 3 (line-left/right): vertical-rl では
      //   float: left  = line-left  = 物理 top    = inline-start
      //   float: right = line-right = 物理 bottom = inline-end
      // 横書き (horizontal-tb) と「inline-start = left / inline-end = right」 が
      // 完全に一致する。 startHalfRect は inline-start (= 物理上半分) を覆い、
      // float: left でその上半分に配置されるため shape の物理位置と一致する。
      startFloat: 'left',
      endFloat: 'right',
      floatBoxOrigin(halfRect, columnBox, polygonBlockSpan) {
        // 縦書き: box 物理 X 範囲 = (column 右端 - polygonBlockSpan) ~ column 右端
        return {
          x: columnBox.x + columnBox.width - polygonBlockSpan,
          y: halfRect.y,
        };
      },
      floatBoxSize(halfRect, polygonBlockSpan) {
        // 縦書き: box 物理 width = polygonBlockSpan (= block 軸方向)、 box 物理 height = halfRect.height (= inline 軸方向)
        return { width: polygonBlockSpan, height: halfRect.height };
      },
    };
  }
  // 横書き: inline = X (左→右), block = Y (上→下)
  // block-start = column 上端、 block-end = column 下端
  return {
    inlineOf: ([x]) => x,
    inlineCenterOfPolygon(poly) {
      const xs = poly.map(([x]) => x);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    },
    startHalfRect(columnBox, inlineCenter) {
      return {
        x: columnBox.x,
        y: columnBox.y,
        width: inlineCenter - columnBox.x,
        height: columnBox.height,
      };
    },
    endHalfRect(columnBox, inlineCenter) {
      return {
        x: inlineCenter,
        y: columnBox.y,
        width: columnBox.x + columnBox.width - inlineCenter,
        height: columnBox.height,
      };
    },
    inlineSize: (box) => box.width,
    blockSize: (box) => box.height,
    polygonBlockEndOf: (poly) => Math.max(...poly.map(([, y]) => y)),
    columnBlockEnd: (box) => box.y + box.height,
    startFloat: 'left',
    endFloat: 'right',
    floatBoxOrigin(halfRect, columnBox, _polygonBlockSpan) {
      // 横書き: box 物理 X 範囲 = halfRect (左 half / 右 half)、 物理 Y 範囲 = column 上端 ~ +polygonBlockSpan
      return { x: halfRect.x, y: columnBox.y };
    },
    floatBoxSize(halfRect, polygonBlockSpan) {
      // 横書き: box 物理 width = halfRect.width、 box 物理 height = polygonBlockSpan
      return { width: halfRect.width, height: polygonBlockSpan };
    },
  };
}

export function reflowObstacles(page: Page): void {
  for (const obstacle of page.obstacles) {
    for (const f of obstacle.floats) f.remove();
    obstacle.floats.length = 0;
  }

  // line-height は CSS 変数で book.root に保持されている。 column 末端 (block-end) に
  // 1 行未満の residual が残ると text が overflow:hidden で滲み出すため、 float の block-size を
  // 延長して埋めるのに使う。
  const rootCs = getComputedStyle(page.book.root);
  const lhVar = Number.parseFloat(rootCs.getPropertyValue('--tilepage-line-height').trim());
  const lineHeightPx = Number.isFinite(lhVar) && lhVar > 0 ? lhVar : 0;

  const pageRect = page.element.getBoundingClientRect();
  if (pageRect.width === 0 || pageRect.height === 0) return;

  const ops = logicalOps(page.book.writingMode);

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

      // logical 軸での polygon の block-end (横書きで polygon の Y 最大、 縦書きで X 最小) を
      // 取り、 column の block-end までの residual を計算する。 column 末端に 1 行未満の隙間が
      // 残れば spacer 出して text の滲みを防ぐ。
      const polygonBlockEnd = ops.polygonBlockEndOf(clipped);
      const columnBlockEnd = ops.columnBlockEnd(columnBox);
      // residual は logical 距離 (常に非負)。 縦書きは block 軸が右→左なので residual = polygonBlockEnd - columnBlockEnd。
      const residualBlock =
        page.book.writingMode === 'vertical-rl'
          ? polygonBlockEnd - columnBlockEnd
          : columnBlockEnd - polygonBlockEnd;
      const fillResidual = lineHeightPx > 0 && residualBlock > 0 && residualBlock < lineHeightPx;

      // clipped polygon を inline-axis の中央で 2 分割し、 各 half polygon を shape-outside と
      // して float に張る。 DOM 順は [startHalf (inline-start 寄せ), endHalf (inline-end 寄せ),
      // spacer] とすることで、 同一 line に 2 half が並んで shape 中央を text に明け渡し、
      // 4 辺 (logical 4 軸 = inline-start/end + block-start/end) すべてに text が流れる。
      const inlineCenter = ops.inlineCenterOfPolygon(clipped);
      const startRect = ops.startHalfRect(columnBox, inlineCenter);
      const endRect = ops.endHalfRect(columnBox, inlineCenter);
      const startHalf = clipPolygonByRect(clipped, startRect);
      const endHalf = clipPolygonByRect(clipped, endRect);

      // 各 float の物理サイズ: inline 軸は half rect の inline-size、 block 軸は column の
      // block-start から polygon block-end までの距離 (= columnBlockSize - residualBlock)。
      // column block-start ~ polygon block-start (= obstacle 物理範囲外の logical block-start
      // 側余白) は float box 内に含まれるが polygon shape 範囲外なので text が流入できる。
      // この構造は横書きで「画像の上に text が流れる」 機構と完全に対称。
      const columnInlineSize = ops.inlineSize(columnBox);
      const columnBlockSize = ops.blockSize(columnBox);
      const polygonBlockSpan = columnBlockSize - residualBlock;
      const blockSizePercent = columnBlockSize > 0 ? (polygonBlockSpan / columnBlockSize) * 100 : 0;

      const anchor = col.firstChild;

      if (startHalf.length >= 3 && ops.inlineSize(startRect) > 0) {
        const inlineSizePercent =
          columnInlineSize > 0 ? (ops.inlineSize(startRect) / columnInlineSize) * 100 : 0;
        const origin = ops.floatBoxOrigin(startRect, columnBox, polygonBlockSpan);
        const boxSize = ops.floatBoxSize(startRect, polygonBlockSpan);
        const f = createHalfFloat(
          startHalf,
          origin.x,
          origin.y,
          boxSize.width,
          boxSize.height,
          inlineSizePercent,
          blockSizePercent,
          ops.startFloat,
          obstacle.shapeMargin,
        );
        col.insertBefore(f, anchor);
        obstacle.floats.push(f);
      }
      if (endHalf.length >= 3 && ops.inlineSize(endRect) > 0) {
        const inlineSizePercent =
          columnInlineSize > 0 ? (ops.inlineSize(endRect) / columnInlineSize) * 100 : 0;
        const origin = ops.floatBoxOrigin(endRect, columnBox, polygonBlockSpan);
        const boxSize = ops.floatBoxSize(endRect, polygonBlockSpan);
        const f = createHalfFloat(
          endHalf,
          origin.x,
          origin.y,
          boxSize.width,
          boxSize.height,
          inlineSizePercent,
          blockSizePercent,
          ops.endFloat,
          obstacle.shapeMargin,
        );
        col.insertBefore(f, anchor);
        obstacle.floats.push(f);
      }
      if (fillResidual) {
        // column 末端 (block-end) に 1 行未満の隙間が残る時、 shape を持たない full-inline
        // spacer を最後に inject して text が滲み出すのを防ぐ。 anchor の前に挿入することで
        // [startHalf, endHalf, spacer] の DOM 順を保つ。
        const spacer = document.createElement('div');
        spacer.className = 'tilepage-obstacle-float';
        spacer.style.float = ops.startFloat;
        spacer.style.inlineSize = '100%';
        spacer.style.blockSize = `${((residualBlock / columnBlockSize) * 100).toFixed(4)}%`;
        col.insertBefore(spacer, anchor);
        obstacle.floats.push(spacer);
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
