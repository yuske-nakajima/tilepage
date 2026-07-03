import {
  addObstacleHorizontal,
  addObstacleVertical,
  type Book,
  type HorizontalObstacleOptions,
  type Obstacle,
  type VerticalObstacleOptions,
} from '../TilePage';

// 見出し用のインラインスタイル指定。
// 未指定キーは inline style に触れず、 利用者の CSS / 親要素継承に委ねる。
interface HeadlineStyle {
  fontSize?: string;
  lineHeight?: number | string;
  fontWeight?: string | number;
  color?: string;
  fontFamily?: string;
}

export type HeadlineHorizontalStyle = HeadlineStyle;
export type HeadlineVerticalStyle = HeadlineStyle;

export interface HeadlineHorizontalOptions {
  text: string;
  whenColumns: HorizontalObstacleOptions['whenColumns'];
  shape?: HorizontalObstacleOptions['shape'];
  shapeMargin?: HorizontalObstacleOptions['shapeMargin'];
}

export interface HeadlineVerticalOptions {
  text: string;
  whenColumns: VerticalObstacleOptions['whenColumns'];
  shape?: VerticalObstacleOptions['shape'];
  shapeMargin?: VerticalObstacleOptions['shapeMargin'];
}

const HEADLINE_TAG = 'h1';

function applyStyle(el: HTMLElement, style: HeadlineStyle): void {
  if (style.fontSize !== undefined) el.style.fontSize = style.fontSize;
  if (style.lineHeight !== undefined) el.style.lineHeight = String(style.lineHeight);
  if (style.fontWeight !== undefined) el.style.fontWeight = String(style.fontWeight);
  if (style.color !== undefined) el.style.color = style.color;
  if (style.fontFamily !== undefined) el.style.fontFamily = style.fontFamily;
}

export function defineHeadlineHorizontal(
  style: HeadlineHorizontalStyle,
): (book: Book, options: HeadlineHorizontalOptions) => Obstacle {
  return (book, options) => {
    const el = document.createElement(HEADLINE_TAG);
    el.textContent = options.text;
    // UA stylesheet の h1 margin は obstacle-layer grid 配置と噛み合わないためリセットする。
    el.style.margin = '0';
    applyStyle(el, style);
    return addObstacleHorizontal(book, {
      element: el,
      whenColumns: options.whenColumns,
      shape: options.shape,
      shapeMargin: options.shapeMargin,
    });
  };
}

export function defineHeadlineVertical(
  style: HeadlineVerticalStyle,
): (book: Book, options: HeadlineVerticalOptions) => Obstacle {
  return (book, options) => {
    const el = document.createElement(HEADLINE_TAG);
    el.textContent = options.text;
    el.style.margin = '0';
    applyStyle(el, style);
    return addObstacleVertical(book, {
      element: el,
      whenColumns: options.whenColumns,
      shape: options.shape,
      shapeMargin: options.shapeMargin,
    });
  };
}
