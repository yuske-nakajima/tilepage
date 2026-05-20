import { axisProjection, type WritingMode } from '../flow/axis';
import { measureLineHeight } from '../flow/measure';
import {
  type Book,
  inlineSizeOfElement,
  type Page,
  reflowObstacles,
  resolveCssLengthToPx,
  runDistribute,
} from '../TilePage';
import type { ObstacleShape } from '../utils/polygon';
import { normalizeShape, type Point, shapeToClipPath } from '../utils/polygon';
import type {
  HorizontalWhenColumnsVariant,
  Obstacle,
  ObstacleOptions,
  VerticalWhenColumnsVariant,
  WhenColumnsVariant,
} from './obstacle';

// 縦書き public variant 群を内部 WhenColumnsVariant 形式に正規化する。
// マッピング:
//   at.row  → grid-row-start    → 内部 at.line
//   at.char → grid-column-start → 内部 at.col
//   rows    → grid-row span     → 内部 lines (= 横書きの lines と同じ logical block 軸 span)
//   chars   → grid-column span  → 内部 cols  (= 横書きの cols と同じ logical inline 軸 span = 段の数)
// 内部 WhenColumnsVariant の cols/lines は CSS span に直結する logical 軸 span で、
//   cols  = grid-column span (= inline 軸 span = 段の数)
//   lines = grid-row span    (= block  軸 span)
// CSS Grid は writing-mode に従い軸 swap されるため、 横書き / 縦書き共通の logical 軸で扱える。
//
// rows 省略時の挙動: lines を undefined にして resolveLines (cols + aspect → lines) 経路に
// 載せる。 横書きの lines 省略時挙動と完全対称。
//
// aspect の swap: aspect は user 視点の物理 W:H 比 ('3/2' = 物理 W:H = 3:2)。 vertical-rl では
// 物理 W = logical block, 物理 H = logical inline。 横書きと共通の logical 計算 (resolveLines:
// cellHeight = cellWidth * h/w) を使うため、 user の aspect 'W/H' を内部 'H/W' に swap して
// logical block/inline 比に変換する。 image natural aspect の imgIntrinsic も同様に swap する。
export function normalizeVerticalWhenColumns(
  whenColumns: Partial<Record<number, VerticalWhenColumnsVariant>>,
): Record<number, WhenColumnsVariant> {
  const out: Record<number, WhenColumnsVariant> = {};
  for (const key of Object.keys(whenColumns)) {
    const n = Number.parseInt(key, 10);
    const v = whenColumns[n];
    if (!v) continue;
    out[n] = {
      page: v.page,
      at: { col: v.at.char, line: v.at.row },
      cols: v.chars,
      lines: v.rows,
      aspect: v.aspect !== undefined ? swapAspect(v.aspect) : undefined,
    };
  }
  return out;
}

// 'W/H' を 'H/W' に swap する。 parseAspect で失敗するフォーマットはそのまま (warn は呼び出し側)。
// vertical-rl 用に user-facing aspect (物理 W:H) を内部 logical 比 (block/inline = H:W) に変換する。
function swapAspect(aspect: string): string {
  const parsed = parseAspect(aspect);
  if (!parsed) return aspect;
  return `${parsed.h}/${parsed.w}`;
}

// 横書き public variant 群を内部形式に正規化する (field 名一致のため shallow copy)。
export function normalizeHorizontalWhenColumns(
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

export function addObstacleToBook(book: Book, options: ObstacleOptions): Obstacle {
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
export function resolveVariantsForBook(book: Book): void {
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
  // 画像 natural aspect (img.naturalWidth/Height) は user 視点の物理 W:H。 vertical-rl では
  // logical block:inline = W:H に対応するため、 resolveLines が期待する「logical inline=w / block=h」
  // 表現に合わせて w/h を swap する (cellHeight = cellWidth * h/w が縦書きでも正しく cellBlock を出す)。
  const rawIntrinsic = getImgIntrinsic(el);
  const imgIntrinsic =
    rawIntrinsic && page.book.writingMode === 'vertical-rl'
      ? { w: rawIntrinsic.h, h: rawIntrinsic.w }
      : rawIntrinsic;
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
  // 縦書き専用: aspect 矛盾 (期待 cellBlock > contentBlockSize) を検出した場合、
  // cols (= 段の数 = user-facing chars) を 1 段ずつデクリメントして整合する最大サイズを採用する。
  // 横書き経路は touched しない (元の variant をそのまま使う)。
  const effectiveVariant =
    page.book.writingMode === 'vertical-rl'
      ? adjustVerticalVariantForFit(variant, { ...baseCtx, imgIntrinsic }, maxLines, el)
      : variant;
  // 横書き / 縦書きとも cols (= grid-column span = 段の数) は variant の必須値 (横書き cols /
  // 縦書き chars) からそのまま採用し、 lines は resolveLines (cols + aspect → lines) で導出する。
  // normalize 段階では columnWidthPx 等の実 px が分からないため attach 経路で解決する。
  const resolvedLines = resolveLines(effectiveVariant, { ...baseCtx, imgIntrinsic });
  const clamped = clampVariantPlacement(effectiveVariant, resolvedLines, n, maxLines);
  el.style.gridColumn = `${clamped.col} / span ${clamped.cols}`;
  el.style.gridRow = `${clamped.line} / span ${clamped.lines}`;
  el.dataset.whenColumns = String(n);
  // 縦書き専用: grid cell の物理 aspect (cellBlock / cellInline = 物理 W/H) が
  // user 指定 aspect (variant.aspect or 画像 natural) と一致しない場合、 cell 内に
  // aspect 合致する最大 sub-rect を取って bbox を縮める。 横書き経路は touch しない。
  applyVerticalBboxAspectFit(el, page.book.writingMode, clamped, baseCtx, rawIntrinsic, variant);
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

// 縦書き専用: aspect 矛盾を検出して cols (= user-facing chars) を 1 段ずつデクリメントする。
// 検出条件: 期待 cellBlock (= resolveLines × lineHeightPx) > 利用可能 contentBlockSize。
// 横書きでは band の物理 X 幅 (= 段幅) と物理 Y 高 (= page 高) のアスペクト比が縦書きと逆で、
// 一般に cols=1 にしても aspect overflow が起きにくいため、 適用しない (task 仕様)。
//
// 最大反復: 10 回 (= 2*8 N 以下に収まる安全装置)。
// デクリメント不能 (cols=1) で未整合なら、 user 指定の最小可能サイズ (cols=1) を採用 + warn。
// 結果は element.dataset.rowsAdjusted / clampReasons に記録 (debug 可能性)。
const MAX_VERTICAL_DECREMENT_ITERATIONS = 10;
function adjustVerticalVariantForFit(
  variant: WhenColumnsVariant,
  ctx: ResolveLinesContext,
  maxLines: number,
  el: HTMLElement,
): WhenColumnsVariant {
  // 前回 attach 時に立てた dataset reason を必ずリセットする (N 変化で integration 復活する場合)。
  if (el.dataset.aspectUnachievable) delete el.dataset.aspectUnachievable;
  if (el.dataset.rowsAdjusted) delete el.dataset.rowsAdjusted;
  if (!Number.isFinite(maxLines) || maxLines <= 0) return variant;
  if (ctx.lineHeightPx <= 0) return variant;
  // aspect 由来の cellBlock 期待値が contentBlockSize を超えていなければ何もしない。
  const initialLines = resolveLines(variant, ctx);
  if (initialLines <= maxLines) return variant;
  // cols を 1 段ずつデクリメントして fit するか試す。
  let cols = variant.cols;
  let iter = 0;
  let probeLines = initialLines;
  while (cols > 1 && iter < MAX_VERTICAL_DECREMENT_ITERATIONS) {
    cols -= 1;
    iter += 1;
    const probe: WhenColumnsVariant = { ...variant, cols };
    probeLines = resolveLines(probe, ctx);
    if (probeLines <= maxLines) {
      // 整合する最大サイズを発見。
      el.dataset.rowsAdjusted = String(variant.cols - cols);
      console.warn('[tilepage] vertical variant cols decremented for aspect fit', {
        obstacleId: el.dataset.id ?? el.id ?? '(unnamed)',
        original: { cols: variant.cols, aspect: variant.aspect },
        adjusted: { cols, lines: probeLines },
        iterations: iter,
      });
      return probe;
    }
  }
  // cols=1 まで下げても整合しない → user 指定の最小可能サイズ (cols=1) を採用。
  // bbox を aspect に合わせて縮めると cell との gap が生じ text wrap 観点で fail するため、
  // ここでは bbox = cell のままにする (= aspect 観点は本質的に未達)。 dataset に reason を残し、
  // 上位レイヤー (test / VLM) で「構造的制約」 として識別できるようにする。
  el.dataset.rowsAdjusted = String(variant.cols - cols);
  el.dataset.aspectUnachievable = 'true';
  console.warn('[tilepage] vertical variant aspect unachievable; using cols=1 (bbox = cell)', {
    obstacleId: el.dataset.id ?? el.id ?? '(unnamed)',
    original: { cols: variant.cols, aspect: variant.aspect },
    adjusted: { cols, requiredLines: probeLines, maxLines },
    note: 'cell aspect cannot match user aspect; bbox aspect will diverge',
  });
  return { ...variant, cols };
}

// 縦書き専用: grid cell の物理 aspect (= block / inline = 物理 W/H) と user 指定 aspect
// (variant.aspect or 画像 natural W:H) が乖離する場合、 cell 内に aspect 合致する最大
// sub-rect を計算し element の inline-size / block-size に直接適用して bbox を縮める。
// align-self / justify-self を 'start' に固定することで、 縮めた gap が cell の logical
// end 側 (vertical-rl: 物理 left + 物理 bottom) に発生する。
//
// shape-outside polygon は reflowObstacles が getBoundingClientRect から再計算するため、
// bbox 縮小が text の回り込み境界に正しく波及する (gap 内に text が流入する)。
//
// dataset:
//   bboxShrunk          = 'true' (shrink 適用時)
//   cellImgGapInline    = inline 軸 gap の px (vertical-rl: 物理 Y 方向 = 下辺寄り)
//   cellImgGapBlock     = block 軸 gap の px (vertical-rl: 物理 X 方向 = 左辺寄り)
//
// 横書き経路は touch しない (cellBlock が contentBlockSize に収まる前提で aspect は cols /
// lines の整数解で十分近似可能。 縦書き mobile N=2 のような物理 cell 制約が厳しい
// ケースは横書きでは発生しない)。
function applyVerticalBboxAspectFit(
  el: HTMLElement,
  writingMode: WritingMode,
  clamped: { cols: number; lines: number },
  ctx: ResolveLinesContext,
  rawIntrinsic: { w: number; h: number } | undefined,
  variant: WhenColumnsVariant,
): void {
  // 前回 attach 時の shrink 設定をクリア (N 変化で aspect 整合が回復する場合がある)。
  const resetShrink = (): void => {
    if (el.dataset.bboxShrunk) delete el.dataset.bboxShrunk;
    if (el.dataset.cellImgGapInline) delete el.dataset.cellImgGapInline;
    if (el.dataset.cellImgGapBlock) delete el.dataset.cellImgGapBlock;
    el.style.inlineSize = '';
    el.style.blockSize = '';
    el.style.justifySelf = '';
    el.style.alignSelf = '';
  };
  if (writingMode !== 'vertical-rl') {
    resetShrink();
    return;
  }
  if (clamped.cols <= 0 || clamped.lines <= 0 || ctx.lineHeightPx <= 0) {
    resetShrink();
    return;
  }
  // 物理 W:H 比の決定。 priority: variant.aspect → 画像 natural。
  // 注意: vertical-rl の internal variant.aspect は normalizeVerticalWhenColumns で
  // user-facing 'W/H' から logical 'H/W' (= block/inline) に swap 済み。 物理 W = block,
  // 物理 H = inline なので、 physical W/H = parsed.w / parsed.h ではなく
  // parsed.w / parsed.h を再度反転して parsed.h / parsed.w を取る (= 元の user W/H)。
  // rawIntrinsic は getImgIntrinsic から physical (naturalWidth, naturalHeight) なので
  // そのまま w / h で physical W/H になる (swap 不要)。
  let targetWH: number | undefined;
  if (variant.aspect) {
    const p = parseAspect(variant.aspect);
    if (p) targetWH = p.h / p.w;
  }
  if (targetWH === undefined && rawIntrinsic) {
    targetWH = rawIntrinsic.w / rawIntrinsic.h;
  }
  if (targetWH === undefined || !Number.isFinite(targetWH) || targetWH <= 0) {
    resetShrink();
    return;
  }
  // cell 物理寸法: vertical-rl では block = X (= 物理 width), inline = Y (= 物理 height)。
  const cellBlockPx = clamped.lines * ctx.lineHeightPx;
  const cellInlinePx =
    clamped.cols * ctx.columnWidthPx + Math.max(0, clamped.cols - 1) * ctx.gutterPx;
  if (cellBlockPx <= 0 || cellInlinePx <= 0) {
    resetShrink();
    return;
  }
  const currentWH = cellBlockPx / cellInlinePx;
  // 0.5% 以内なら shrink 不要 (test 許容は ±5% で十分余裕)。
  const RELATIVE_EPS = 0.005;
  if (Math.abs(currentWH - targetWH) / targetWH <= RELATIVE_EPS) {
    resetShrink();
    return;
  }
  // cell 内に target 比の最大 sub-rect を取る。 まず block 軸 full を試し、 inline がはみ出すなら inline full に切り替える。
  let bboxBlockPx = cellBlockPx;
  let bboxInlinePx = cellBlockPx / targetWH;
  if (bboxInlinePx > cellInlinePx) {
    bboxInlinePx = cellInlinePx;
    bboxBlockPx = cellInlinePx * targetWH;
  }
  // どちらかが cell を超える数値誤差は clamp で吸収。
  if (bboxBlockPx > cellBlockPx) bboxBlockPx = cellBlockPx;
  if (bboxInlinePx > cellInlinePx) bboxInlinePx = cellInlinePx;
  const gapInline = Math.max(0, cellInlinePx - bboxInlinePx);
  const gapBlock = Math.max(0, cellBlockPx - bboxBlockPx);
  el.style.inlineSize = `${bboxInlinePx.toFixed(4)}px`;
  el.style.blockSize = `${bboxBlockPx.toFixed(4)}px`;
  el.style.justifySelf = 'start';
  el.style.alignSelf = 'start';
  el.dataset.bboxShrunk = 'true';
  el.dataset.cellImgGapInline = gapInline.toFixed(2);
  el.dataset.cellImgGapBlock = gapBlock.toFixed(2);
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
