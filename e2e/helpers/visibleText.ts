import type { Page } from '@playwright/test';

export interface VisibleTextResult {
  text: string;
  length: number;
}

export interface VisibleTextOptions {
  // 抽出対象の root selector。省略時は document.body。
  rootSelector?: string;
  // この selector に一致する要素 (とその子孫) の text を抽出から除外する。
  // 例: obstacle 層の見出し text を除いて flow text だけを比較したい場合に使う。
  excludeSelectors?: string[];
  // reading order の比較は後段で行うため helper は DOM 順を維持する。
  // textNode 単位で連結し、1 文字 = 1 emit を保証する。
}

// Playwright 側 helper: page.evaluate で in-browser に走らせる
export async function visibleTextOf(
  page: Page,
  options: VisibleTextOptions = {},
): Promise<VisibleTextResult> {
  return await page.evaluate(extractVisibleText, {
    rootSelector: options.rootSelector ?? null,
    excludeSelectors: options.excludeSelectors ?? [],
  });
}

// page.evaluate に渡す関数。ブラウザ環境で実行される。
// elementFromPoint / innerText / textContent の単独判定は禁止 (設計文書 L516-L520)。
function extractVisibleText(args: {
  rootSelector: string | null;
  excludeSelectors: string[];
}): VisibleTextResult {
  const root: HTMLElement = args.rootSelector
    ? ((document.querySelector(args.rootSelector) as HTMLElement | null) ?? document.body)
    : document.body;
  // root の scroll 領域全体を rect として扱う (scroll しなくても scroll で到達可能な範囲は visible)。
  const baseRect = root.getBoundingClientRect();
  const rootRect = {
    left: baseRect.left,
    top: baseRect.top,
    right: baseRect.left + Math.max(root.scrollWidth, baseRect.width),
    bottom: baseRect.top + Math.max(root.scrollHeight, baseRect.height),
    width: Math.max(root.scrollWidth, baseRect.width),
    height: Math.max(root.scrollHeight, baseRect.height),
  };

  // textNode に WeakMap でユニーク ID を振り、duplicate ガードのキーに使う
  const tnIdMap = new WeakMap<Text, number>();
  let nextTnId = 1;
  const idOf = (tn: Text): number => {
    const cached = tnIdMap.get(tn);
    if (cached !== undefined) return cached;
    const id = nextTnId++;
    tnIdMap.set(tn, id);
    return id;
  };

  // 祖先 chain で overflow を持つ要素の rect 集合を集める
  // clip 判定: rect が rootRect および全 overflow ancestor の rect と交差していること
  const overflowAncestorsCache = new WeakMap<Element, HTMLElement[]>();
  const overflowAncestorsOf = (el: Element): HTMLElement[] => {
    const cached = overflowAncestorsCache.get(el);
    if (cached) return cached;
    const list: HTMLElement[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.documentElement) {
      if (cur instanceof HTMLElement) {
        const cs = window.getComputedStyle(cur);
        const ox = cs.overflowX;
        const oy = cs.overflowY;
        const isClipping =
          ox === 'hidden' ||
          ox === 'clip' ||
          ox === 'scroll' ||
          ox === 'auto' ||
          oy === 'hidden' ||
          oy === 'clip' ||
          oy === 'scroll' ||
          oy === 'auto';
        if (isClipping) list.push(cur);
      }
      cur = cur.parentElement;
    }
    overflowAncestorsCache.set(el, list);
    return list;
  };

  // subpixel rendering で境界が 0.5px ほどズレることがあるため、 1px 程度の許容を持たせる。
  const EPS = 1;
  const intersects = (
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number },
  ): boolean => {
    return !(
      a.right <= b.left - EPS ||
      a.left >= b.right + EPS ||
      a.bottom <= b.top - EPS ||
      a.top >= b.bottom + EPS
    );
  };

  // rect が root と全 overflow 祖先と交差していれば visible とみなす
  // 行端で width/height=0 の rect が返ることがある (空白の collapse、行末 word break 等)。
  // この場合 rect 自体は面積 0 だが、 left/top 点が ancestor 内なら「読める文字」として扱う。
  const isVisible = (rect: DOMRect, parentEl: Element): boolean => {
    const pointInside = (
      r: { left: number; top: number; right: number; bottom: number },
      x: number,
      y: number,
    ): boolean => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const zeroSize = rect.width <= 0 || rect.height <= 0;
    if (zeroSize) {
      if (!pointInside(rootRect, rect.left, rect.top)) return false;
      for (const anc of overflowAncestorsOf(parentEl)) {
        const ancRect = scrollableRectOf(anc);
        if (!pointInside(ancRect, rect.left, rect.top)) return false;
      }
      return true;
    }
    if (!intersects(rect, rootRect)) return false;
    for (const anc of overflowAncestorsOf(parentEl)) {
      const ancRect = scrollableRectOf(anc);
      if (!intersects(rect, ancRect)) return false;
    }
    return true;
  };

  // 要素の scroll 領域全体を rect として返す。 overflow:auto/scroll で scroll すれば
  // 見える領域は visible とみなすため。 overflow:hidden / clip は scroll しても見えないので
  // scroll 領域は使わず可視 rect のみ。
  const scrollableRectOf = (
    el: HTMLElement,
  ): { left: number; top: number; right: number; bottom: number } => {
    const r = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const canScrollX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    const canScrollY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
    return {
      left: r.left,
      top: r.top,
      right: r.left + (canScrollX ? Math.max(el.scrollWidth, r.width) : r.width),
      bottom: r.top + (canScrollY ? Math.max(el.scrollHeight, r.height) : r.height),
    };
  };

  // DOM walk で TextNode を列挙
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // script / style は除外
      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
        return NodeFilter.FILTER_REJECT;
      }
      const cs = window.getComputedStyle(parent);
      if (cs.display === 'none' || cs.visibility === 'hidden') {
        return NodeFilter.FILTER_REJECT;
      }
      for (const sel of args.excludeSelectors) {
        if (parent.closest(sel)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let cur = walker.nextNode();
  while (cur) {
    textNodes.push(cur as Text);
    cur = walker.nextNode();
  }

  const emittedChars = new Set<string>();
  let result = '';

  for (const tn of textNodes) {
    const parent = tn.parentElement;
    if (!parent) continue;
    const tnId = idOf(tn);
    const data = tn.data;
    for (let i = 0; i < data.length; i++) {
      const key = `${tnId}:${i}`;
      if (emittedChars.has(key)) continue;
      const range = document.createRange();
      try {
        range.setStart(tn, i);
        range.setEnd(tn, i + 1);
      } catch {
        continue;
      }
      const rects = range.getClientRects();
      let visible = false;
      for (const r of rects) {
        if (isVisible(r, parent)) {
          visible = true;
          break;
        }
      }
      if (visible) {
        emittedChars.add(key);
        result += data[i];
      }
    }
  }

  return { text: result, length: [...result].length };
}
