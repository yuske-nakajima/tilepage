import type { Book } from '../TilePage';
import { addObstacleHorizontal, type HorizontalObstacleOptions, type Obstacle } from './obstacle';

// 任意 DOM を内側に配置できる汎用ボックス obstacle (横書き)。
// src / alt は image 用のため除外する。 element は呼び出し側が DOM を直接渡せるよう残す。
export interface BoxHorizontalOptions extends Omit<HorizontalObstacleOptions, 'src' | 'alt'> {
  // CSS border プロパティ値 (例: '1px solid #000')。 element の inline style に直接適用する。
  border?: string;
  // CSS padding プロパティ値 (例: '1em')。 element の inline style に直接適用する。
  padding?: string;
}

export function addBoxHorizontal(book: Book, options: BoxHorizontalOptions): Obstacle {
  // element 未指定時は空 div を生成。 指定があれば外部 DOM を尊重する。
  const boxEl = options.element ?? document.createElement('div');
  boxEl.classList.add('tilepage-box');

  if (options.border !== undefined) {
    boxEl.style.border = options.border;
  }
  if (options.padding !== undefined) {
    boxEl.style.padding = options.padding;
  }

  const { border: _border, padding: _padding, element: _element, ...rest } = options;
  return addObstacleHorizontal(book, {
    ...rest,
    element: boxEl,
  });
}
