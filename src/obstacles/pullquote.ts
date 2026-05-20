import type { Book } from '../TilePage';
import { addObstacleHorizontal, type HorizontalObstacleOptions, type Obstacle } from './obstacle';

// プルクオート (引用ブロック) を obstacle として配置する横書き専用 API。
// element / src / alt を Omit する理由: <blockquote> を内部生成するため、 element 経路を
// 外側に開けると意味的構造 (引用要素) が崩れる。
export interface PullquoteHorizontalOptions
  extends Omit<HorizontalObstacleOptions, 'element' | 'src' | 'alt'> {
  // 引用本文。 引用符は CSS の quotes プロパティで出すため、 ここでは文字列に含めない。
  text: string;
  // 引用元 (省略可)。 指定時のみ <cite> 子要素として追加される。
  cite?: string;
}

export function addPullquoteHorizontal(book: Book, options: PullquoteHorizontalOptions): Obstacle {
  const blockquote = document.createElement('blockquote');
  blockquote.classList.add('tilepage-pullquote');

  // 引用本文。 引用符は CSS ::before/::after で付与するので、 textContent はそのまま流す。
  // <cite> を後で append するため、 まずテキストだけを span に包んで配置する。
  const textNode = document.createElement('span');
  textNode.classList.add('tilepage-pullquote-text');
  textNode.textContent = options.text;
  blockquote.appendChild(textNode);

  if (options.cite !== undefined) {
    const citeEl = document.createElement('cite');
    citeEl.textContent = options.cite;
    blockquote.appendChild(citeEl);
  }

  const { text: _text, cite: _cite, ...rest } = options;
  return addObstacleHorizontal(book, {
    ...rest,
    element: blockquote,
  });
}
