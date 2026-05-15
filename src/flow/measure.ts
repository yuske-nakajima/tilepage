import type { AxisProjection } from './axis';

// flow-text の line-height を Range#getClientRects で実測する。
// 1 文字 Range の block 軸サイズ = 1 行高として扱う。
// テキスト未投入 / フォント未ロード等で測れない場合は、 computed style の line-height を
// 解釈し、最終フォールバックは font-size * 1.5 (CSS の normal 相当)。
// 戻り値の単位は px 数値。NaN / 0 ガード済み (返値は常に有限正数)。
export function measureLineHeight(root: HTMLElement, projection: AxisProjection): number {
  const doc = root.ownerDocument;
  // computed style の line-height は CSS の line box そのもの。Range#getClientRects は
  // glyph metrics (ascent+descent) を返すため line-height より小さくなり、grid 行と
  // text 行の整合性が崩れる。computed style を優先し、Range は normal 時の fallback。
  const fromStyle = measureLineHeightFromComputedStyle(root);
  if (Number.isFinite(fromStyle) && fromStyle > 0) return fromStyle;
  const fromRange = measureLineHeightFromRange(root, projection);
  if (Number.isFinite(fromRange) && fromRange > 0) return fromRange;
  return measureLineHeightFromProbe(doc, root);
}

// .tilepage-flow-text の 1 grapheme Range の block 軸サイズを行高とする。
function measureLineHeightFromRange(root: HTMLElement, projection: AxisProjection): number {
  const holder = root.querySelector<HTMLElement>('.tilepage-flow-text');
  if (!holder) return Number.NaN;
  const data = holder.firstChild as Text | null;
  if (!data || data.data.length === 0) return Number.NaN;
  const range = root.ownerDocument.createRange();
  try {
    range.setStart(data, 0);
    range.setEnd(data, 1);
  } catch {
    return Number.NaN;
  }
  const rects = range.getClientRects();
  if (rects.length === 0) return Number.NaN;
  // 同じ文字に複数 rect が返るのは line wrap 直前等。 最大の block 軸サイズを採る。
  let max = 0;
  for (const r of rects) {
    const size = Math.abs(projection.blockAxisOf(r).size);
    if (size > max) max = size;
  }
  return max;
}

// computed style の line-height (数値 px) を読む。 'normal' は NaN を返す。
function measureLineHeightFromComputedStyle(root: HTMLElement): number {
  const holder =
    root.querySelector<HTMLElement>('.tilepage-flow-text') ??
    root.querySelector<HTMLElement>('.tilepage-column') ??
    root;
  const cs = root.ownerDocument.defaultView?.getComputedStyle(holder);
  if (!cs) return Number.NaN;
  const lh = Number.parseFloat(cs.lineHeight);
  if (Number.isFinite(lh) && lh > 0) return lh;
  return Number.NaN;
}

// 一時要素を生成して font-size を読み取り 1.5 倍した値を返す。 最終フォールバック。
function measureLineHeightFromProbe(doc: Document, root: HTMLElement): number {
  const probe = doc.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.textContent = 'M';
  root.appendChild(probe);
  const cs = doc.defaultView?.getComputedStyle(probe);
  const fontSize = cs ? Number.parseFloat(cs.fontSize) : Number.NaN;
  probe.remove();
  if (Number.isFinite(fontSize) && fontSize > 0) return fontSize * 1.5;
  // 最終手段。デフォルト em ≒ 16 / line-height ≒ 24 相当。
  return 24;
}

// window 要素に text を流した時、その window の block 軸方向にいくつ収まるかを返す。
// 戻り値は「収まった (= 描画後に block 軸が window の block-size を超えない) 末尾 index (exclusive)」。
// 「収まった」とは: Range#getClientRects() の rect 群を projection で block 軸に投影し、
// その最大 end が window 要素の block 軸 end を超えないこと。
//
// アルゴリズム: 文字 (grapheme) 単位の binary search。
// 1. textContent に candidate 文字列を入れて再 layout
// 2. Range で [0, mid) を覆う rect 群を取得し、block 軸 end を測る
// 3. window の block-size と比較して lo/hi を更新
//
// この処理は CSS では決定できないため JS で実測する (評価軸 #6)。
export function fitTextIntoWindow(
  win: HTMLElement,
  graphemes: ReadonlyArray<string>,
  startIndex: number,
  projection: AxisProjection,
): number {
  if (startIndex >= graphemes.length) return startIndex;

  // 専用の text holder を作って window 内の他要素 (float 等) と分離する
  const holder = ensureTextHolder(win);

  // window の block 軸 end を取得
  const winBlock = projection.blockAxisOf(win.getBoundingClientRect());
  const winBlockSize = Math.abs(winBlock.size);
  if (winBlockSize <= 0) return startIndex;

  // 残り全部入るか試す (一番多いケース)
  const remaining = graphemes.length - startIndex;
  const all = graphemes.slice(startIndex, startIndex + remaining).join('');
  holder.textContent = all;
  const allFits = measureContentBlockSize(holder, projection) <= winBlockSize - 1;
  if (allFits) return graphemes.length;

  // binary search で最大の length を求める
  let lo = 0;
  let hi = remaining;
  while (lo < hi) {
    const mid = ((lo + hi + 1) / 2) | 0;
    const slice = graphemes.slice(startIndex, startIndex + mid).join('');
    holder.textContent = slice;
    const fits = measureContentBlockSize(holder, projection) <= winBlockSize - 1;
    if (fits) lo = mid;
    else hi = mid - 1;
  }

  // 最低 1 文字は進める (0 にすると無限ループ。window が極端に小さいケース)
  let advanced = Math.max(lo, 1);
  let finalSlice = graphemes.slice(startIndex, startIndex + advanced).join('');
  holder.textContent = finalSlice;
  // measure 後の実 DOM で float の再配置等により計算ずれが残ることがあるため、
  // 実際に overflow していたら 1 grapheme ずつ削って収まる位置まで戻す。
  let safety = 64;
  while (advanced > 1 && safety-- > 0) {
    if (measureContentBlockSize(holder, projection) <= winBlockSize) break;
    advanced -= 1;
    finalSlice = graphemes.slice(startIndex, startIndex + advanced).join('');
    holder.textContent = finalSlice;
  }
  return startIndex + advanced;
}

// window 内のテキストホルダ。 .tilepage-flow-text を 1 つだけ持つ。
function ensureTextHolder(win: HTMLElement): HTMLElement {
  let holder = win.querySelector<HTMLElement>(':scope > .tilepage-flow-text');
  if (!holder) {
    holder = win.ownerDocument.createElement('div');
    holder.className = 'tilepage-flow-text';
    win.appendChild(holder);
  }
  return holder;
}

// window 内で holder が text を表示するのに使った block 軸方向のサイズを実測する。
// Range#getClientRects() で各行 rect を取得し、 holder の block 軸 start から最も離れた
// rect 端までの距離を返す。 holder 上端より上に float がある場合 (回り込み) も含めて、
// window 上端からの「使用量」を返すために holder ではなく window 上端を基準にする。
function measureContentBlockSize(holder: HTMLElement, projection: AxisProjection): number {
  const data = holder.firstChild as Text | null;
  if (!data) return 0;
  const range = holder.ownerDocument.createRange();
  range.setStart(data, 0);
  range.setEnd(data, data.data.length);
  const rects = range.getClientRects();
  if (rects.length === 0) return 0;
  const win = holder.parentElement;
  if (!win) return 0;
  const winBlock = projection.blockAxisOf(win.getBoundingClientRect());
  let maxDistance = 0;
  for (const r of rects) {
    const b = projection.blockAxisOf(r);
    // start から end までの絶対距離 (axis projection によっては start > end になりうる)
    const dStart = Math.abs(b.start - winBlock.start);
    const dEnd = Math.abs(b.end - winBlock.start);
    const d = Math.max(dStart, dEnd);
    if (d > maxDistance) maxDistance = d;
  }
  return maxDistance;
}
