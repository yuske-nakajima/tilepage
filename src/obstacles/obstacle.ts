import type { Book, GridPos } from '../TilePage';
import type { ObstacleShape, Point } from '../utils/polygon';
import {
  addObstacleToBook,
  normalizeHorizontalWhenColumns,
  normalizeVerticalWhenColumns,
} from './internal';

// 段数 N が一致した時に採用される配置 variant (内部表現)。
// at.col / at.line は 1-indexed。 line は obstacle-layer の auto-fill row index。
// 縦書き variant は内部でこの形式に正規化される (at.row→line, at.char→col, rows→lines, chars→cols)。
// lines / aspect の解決優先順位:
//   1. aspect 指定あり → cols から lines を導出 (lines も指定されていれば warn して aspect 優先)
//   2. aspect 未指定で lines 指定 → そのまま
//   3. 両方未指定 → 画像 natural aspect (img.naturalWidth / img.naturalHeight) から導出
//      画像以外 / natural が取れない場合は FALLBACK_LINES (= 4)
//
// 縦書き正規化: vertical-rl では CSS Grid が writing-mode に従い軸 swap するため、
// `grid-column span` (= 内部 cols) が「段組みの段 (column band)」 = 段の数を span する。
// よって縦書き public API では `chars` を必須 (= 段の数 = 横書き cols 相当)、
// `rows` を省略可 (= block 軸 line 数 = 横書き lines 相当、 aspect から自動導出可) にして
// 横書きと完全対称にする。
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

// 公開 API: 縦書き variant。
// vertical-rl では CSS Grid の grid-template-columns が inline 軸 (= 物理 Y 軸) を N 等分し、
// `grid-column span` = 「段組みの段の数」 をそのまま表す (横書きの cols と同じ意味)。
// よって `chars` が「段の数」 必須、 `rows` (block 軸 line 数) は aspect から自動導出可能で省略可。
// field 名を `cols/lines` から `rows/chars` に分けることで API 利用者の混乱を避ける。
export interface VerticalWhenColumnsVariant {
  page: number;
  at: { row: number; char: number };
  rows?: number;
  chars: number;
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
  currentPage?: import('../TilePage').Page;
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
