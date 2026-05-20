import type { Book } from '../TilePage';
import { addObstacleHorizontal, type HorizontalObstacleOptions, type Obstacle } from './obstacle';

// 見出し要素 (h1-h6) を obstacle として配置する横書き専用 API。
// element / src / alt を Omit する理由: <h${level}> を内部生成するため、 element 経路を
// 外側に開けると意味的構造 (heading level) が崩れる。
export interface HeadlineHorizontalOptions
  extends Omit<HorizontalObstacleOptions, 'element' | 'src' | 'alt'> {
  // 1-6 整数。 内部で <h${level}> を生成する。 範囲外は throw。
  level: 1 | 2 | 3 | 4 | 5 | 6;
  // 見出しテキスト。 改行は <br> に変換せず、 そのまま textContent に流す。
  text: string;
  // 枠 bbox に収まる最大 font-size を二分探索で決定する。 default false。
  fitToBox?: boolean;
}

// fitToBox の font-size 探索範囲 (px)。 整数 px 単位で「収まる最大値」 を選ぶ。
const FIT_MIN_PX = 5;
const FIT_MAX_PX = 200;
// 二分探索の反復回数上限。 log2(200-5) ≈ 8 で十分収束する想定だが、 計測誤差に備え余裕を持たせる。
// 無限ループ防止のための安全装置。
export const FIT_MAX_ITERATIONS = 30;

// fitToBox 計測時に許容する overflow tolerance (px)。 subpixel rendering の丸めで
// inline-size を 0.5px 程度超える計測値を返すケースがあるため、 厳密 <= ではなく
// <= (枠 + EPS) で「収まる」 判定にする。
const FIT_OVERFLOW_EPS_PX = 0.5;

// 単一の font-size px が「枠 inline-size に収まる」 かを判定する。
// テストで再利用するため export する (公開 API ではない `_` prefix)。
export function _fitsAtFontSize(el: HTMLElement, fontSizePx: number, maxInlinePx: number): boolean {
  el.style.fontSize = `${fontSizePx}px`;
  // scrollWidth は word-break / overflow-wrap 設定に依存するため、 inline-size 専用の
  // 計測には getBoundingClientRect ではなく scrollWidth を使う (折り返し抑止状態で
  // overflow した分が scrollWidth に出る)。
  const measured = el.scrollWidth;
  return measured <= maxInlinePx + FIT_OVERFLOW_EPS_PX;
}

// 二分探索で「収まる最大の整数 px」 を探す。 範囲外で常に収まらない場合 min を返す。
// テストで再利用するため export する。
export function _findBestFontSize(
  el: HTMLElement,
  maxInlinePx: number,
  options?: { min?: number; max?: number; maxIterations?: number },
): number {
  const minPx = options?.min ?? FIT_MIN_PX;
  const maxPx = options?.max ?? FIT_MAX_PX;
  const maxIter = options?.maxIterations ?? FIT_MAX_ITERATIONS;
  // 折り返しを抑止して「1 行に必要な inline-size」 を計測する。
  const prevWhiteSpace = el.style.whiteSpace;
  el.style.whiteSpace = 'nowrap';
  try {
    let lo = minPx;
    let hi = maxPx;
    let best = lo;
    // 下端で既に overflow する場合は lo をそのまま採用 (overflow するが最低値)。
    if (!_fitsAtFontSize(el, lo, maxInlinePx)) {
      el.style.fontSize = `${lo}px`;
      return lo;
    }
    // 上端で収まる場合は hi を採用。
    if (_fitsAtFontSize(el, hi, maxInlinePx)) {
      el.style.fontSize = `${hi}px`;
      return hi;
    }
    let iter = 0;
    while (lo <= hi && iter < maxIter) {
      const mid = Math.floor((lo + hi) / 2);
      if (_fitsAtFontSize(el, mid, maxInlinePx)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
      iter += 1;
    }
    el.style.fontSize = `${best}px`;
    return best;
  } finally {
    el.style.whiteSpace = prevWhiteSpace;
  }
}

// fitToBox の再計算。 obstacle.element の inline-size を測り、 内部 heading の font-size を確定する。
// document.fonts.ready は呼び出し側でも呼ぶ前提だが、 ここでも二重 await する。
async function recomputeFontSize(
  headingEl: HTMLHeadingElement,
  parentEl: HTMLElement,
): Promise<void> {
  if (
    typeof document !== 'undefined' &&
    document.fonts &&
    typeof document.fonts.ready?.then === 'function'
  ) {
    await document.fonts.ready;
  }
  // 枠の inline-size。 横書きでは width 相当。 padding を引きたいが obstacle 自身に padding は
  // 通常掛かっていない (.tilepage-obstacle は width:100%/height:100%)。 clientWidth で十分。
  const maxInlinePx = parentEl.clientWidth;
  if (!Number.isFinite(maxInlinePx) || maxInlinePx <= 0) return;
  _findBestFontSize(headingEl, maxInlinePx);
}

export function addHeadlineHorizontal(book: Book, options: HeadlineHorizontalOptions): Obstacle {
  // level の runtime guard。 型レベルでも 1|2|3|4|5|6 リテラル union に絞っているが、
  // string 化された数値が流れ込むケース (JSON 経由等) を防ぐ。
  const level = options.level;
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new Error(`addHeadlineHorizontal: level must be an integer 1-6 (got ${String(level)})`);
  }

  const heading = document.createElement(`h${level}`) as HTMLHeadingElement;
  heading.classList.add('tilepage-headline');
  heading.textContent = options.text;

  // obstacle 本体は addObstacleHorizontal の element 経路に流す。 heading は obstacle の
  // 中に置く構造にする (obstacle 自身は grid セルを占有する div、 その中に <hN> を入れる)。
  // ただし addObstacleHorizontal の element 引数は obstacle 自体の要素として扱われるため、
  // ここでは heading をそのまま element として渡す。 .tilepage-obstacle class は内部で付与される。
  const { level: _level, text: _text, fitToBox, ...rest } = options;
  const obstacle = addObstacleHorizontal(book, {
    ...rest,
    element: heading,
  });

  if (fitToBox) {
    // 初回計測。 document.fonts.ready の解決を待ってから走らせる。
    void recomputeFontSize(heading, heading);

    // ResizeObserver による再計算。 obstacle 要素自身の bbox 変化を検知する。
    // ResizeObserver が無い環境 (古い jsdom 等) では skip し、 初回計測のみで完了する。
    if (typeof ResizeObserver !== 'undefined') {
      let scheduled = false;
      const observer = new ResizeObserver(() => {
        if (scheduled) return;
        scheduled = true;
        // microtask に逃がして同 frame 内の連続発火を 1 回に集約する。
        queueMicrotask(() => {
          scheduled = false;
          void recomputeFontSize(heading, heading);
        });
      });
      observer.observe(heading);
      // GC で observer が消えないよう element に参照を持たせる (closure だけだと
      // bundler の dead-code 除去で消えるリスクがある)。 disconnect の責務は
      // 呼び出し側のページライフサイクル (destroyBook) に委ねる。
      (
        heading as unknown as { _tilepageHeadlineObserver?: ResizeObserver }
      )._tilepageHeadlineObserver = observer;
      heading.dataset.tilepageHeadlineFit = 'true';
    }
  }

  return obstacle;
}
