import type { Page } from '@playwright/test';

export interface VisibleTextResult {
  text: string;
  length: number;
}

export interface VisibleTextOptions {
  // 抽出対象の root selector。省略時は document.body。
  rootSelector?: string;
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
  });
}

// page.evaluate に渡す関数。ブラウザ環境で実行される。
// elementFromPoint / innerText / textContent の単独判定は禁止 (設計文書 L516-L520)。
function extractVisibleText(args: { rootSelector: string | null }): VisibleTextResult {
  const root: HTMLElement = args.rootSelector
    ? ((document.querySelector(args.rootSelector) as HTMLElement | null) ?? document.body)
    : document.body;
  const rootRect = root.getBoundingClientRect();

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

  const intersects = (
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number },
  ): boolean => {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  };

  // rect が root と全 overflow 祖先と交差していれば visible とみなす
  const isVisible = (rect: DOMRect, parentEl: Element): boolean => {
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (!intersects(rect, rootRect)) return false;
    for (const anc of overflowAncestorsOf(parentEl)) {
      const ancRect = anc.getBoundingClientRect();
      if (!intersects(rect, ancRect)) return false;
    }
    return true;
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
