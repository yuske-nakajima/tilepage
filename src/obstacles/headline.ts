import {
  addObstacleHorizontal,
  type Book,
  type HorizontalObstacleOptions,
  type Obstacle,
} from '../TilePage';

// 見出し用のインラインスタイル指定。
// 未指定キーは inline style に触れず、 利用者の CSS / 親要素継承に委ねる。
export interface HeadlineHorizontalStyle {
  fontSize?: string;
  lineHeight?: number | string;
  fontWeight?: string | number;
  color?: string;
  fontFamily?: string;
}

// 見出し obstacle 配置オプション。 whenColumns は HorizontalObstacleOptions の同名 field と同形。
export interface HeadlineHorizontalOptions {
  text: string;
  whenColumns: HorizontalObstacleOptions['whenColumns'];
  shape?: HorizontalObstacleOptions['shape'];
  shapeMargin?: HorizontalObstacleOptions['shapeMargin'];
}

// 内部生成タグは <h1> 固定。 level 引数は持たない (公開 API 表面を最小化する)。
const HEADLINE_TAG = 'h1';

// HeadlineHorizontalStyle を h1 element の inline style にパススルーする。
// undefined のキーは触らず、 spec の「未指定時にデフォルト押し付けなし」 を満たす。
function applyStyle(el: HTMLElement, style: HeadlineHorizontalStyle): void {
  if (style.fontSize !== undefined) el.style.fontSize = style.fontSize;
  if (style.lineHeight !== undefined) el.style.lineHeight = String(style.lineHeight);
  if (style.fontWeight !== undefined) el.style.fontWeight = String(style.fontWeight);
  if (style.color !== undefined) el.style.color = style.color;
  if (style.fontFamily !== undefined) el.style.fontFamily = style.fontFamily;
}

// defineHeadlineHorizontal(style) → (book, options) => Obstacle のカリー化 API。
// 戻り値関数を複数回呼んでも独立した Obstacle が生成される (state を持たない)。
// 内部実装は <h1> を生成し style を inline で適用、 addObstacleHorizontal の element 経路に流す。
export function defineHeadlineHorizontal(
  style: HeadlineHorizontalStyle,
): (book: Book, options: HeadlineHorizontalOptions) => Obstacle {
  return (book, options) => {
    const el = document.createElement(HEADLINE_TAG);
    el.textContent = options.text;
    applyStyle(el, style);
    return addObstacleHorizontal(book, {
      element: el,
      whenColumns: options.whenColumns,
      shape: options.shape,
      shapeMargin: options.shapeMargin,
    });
  };
}
