import { expect, test } from '@playwright/test';

// defineHeadlineHorizontal で配置した main-title (h1[data-id="main-title"]) を厳密検証する。
// layout-verification.md 必須観点を全て満たす:
//   1. toBeInViewport (viewport 内可視性)
//   2. visible text 包含
//   3. h1 bbox と 全 .tilepage-obstacle / .tilepage-obstacle-float / .tilepage-flow-text 内 text node の交差 0 件
//   4. 拡大スクショ保存 + clip 矩形が h1 bbox を 4 辺すべてで完全包含することを spec 内 assert

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// viewport ごとに spec を組み立てる。 desktop は N=6 (king を col 4-6 に逃がす)、 mobile は N=2 (king を line 100 に逃がす)。
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 900 }, expectedN: 6 },
  { name: 'mobile', viewport: { width: 412, height: 915 }, expectedN: 2 },
];

for (const v of VIEWPORTS) {
  test.describe(`defineHeadlineHorizontal (${v.name})`, () => {
    test.use({ viewport: v.viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto('/demo/');
      await page.waitForSelector('.tilepage-book');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState('networkidle');
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    });

    test(`main-title は viewport 内に visible で表示される + 衝突なし + スクショ保存 (N=${v.expectedN})`, async ({
      page,
    }) => {
      // N が想定どおりであることを sanity check。
      const n = await page.locator('.tilepage-book').first().getAttribute('data-active-columns');
      expect(n).toBe(String(v.expectedN));

      const title = page.locator('h1[data-id="main-title"]');

      // 観点 1: toBeInViewport — DOM 存在のみでは PASS させない。
      await expect(title).toBeInViewport();

      // 観点 2: visible text 包含。
      await expect(title).toContainText('走れメロス');

      // 観点 3: 全 obstacle layer + text node との bbox 交差 0 件。
      // element.boundingBox() は grid cell サイズで報告される一方、 h1 の glyph (fontSize × line-height)
      // が cell より大きいと visual overflow しても element box が小さく出る (v0.5.5 で見落とした罠)。
      // よって element box と Range over text content の union を取り、 実 glyph 矩形を捕捉する。
      const elementBox = await title.boundingBox();
      if (!elementBox) throw new Error('main-title boundingBox が取得できない');
      const rangeBox = await page.evaluate(() => {
        const h1 = document.querySelector('h1[data-id="main-title"]');
        if (!h1) return null;
        const range = document.createRange();
        range.selectNodeContents(h1);
        const r = range.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      // element box と range box の union を採用 (どちらか欠ければそのまま、 両方あれば外接矩形)。
      const titleBox: Rect = rangeBox
        ? {
            x: Math.min(elementBox.x, rangeBox.x),
            y: Math.min(elementBox.y, rangeBox.y),
            width:
              Math.max(elementBox.x + elementBox.width, rangeBox.x + rangeBox.width) -
              Math.min(elementBox.x, rangeBox.x),
            height:
              Math.max(elementBox.y + elementBox.height, rangeBox.y + rangeBox.height) -
              Math.min(elementBox.y, rangeBox.y),
          }
        : elementBox;

      // 同 element 自身は除外して比較する。
      const obstacleBoxes = await page.evaluate(() => {
        const result: Array<Rect & { id: string; cls: string }> = [];
        const all = document.querySelectorAll('.tilepage-obstacle, .tilepage-obstacle-float');
        for (const el of Array.from(all)) {
          const id = el.getAttribute('data-id') ?? '';
          if (id === 'main-title') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          // display:none / 隠れ要素は除外する (graceful degrade 中の obstacle)。
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          result.push({
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            id,
            cls: el.className,
          });
        }
        return result;
      });

      for (const o of obstacleBoxes) {
        const intersects = rectsIntersect(titleBox, o);
        expect(
          intersects,
          `main-title が obstacle "${o.id}" (${o.cls}) と交差 (titleBox=${JSON.stringify(titleBox)}, oBox=${JSON.stringify(o)})`,
        ).toBe(false);
      }

      // 本文 text node との交差判定 (Range.getClientRects を使って実 glyph 矩形を取得)。
      const textNodeRects = await page.evaluate(() => {
        const out: Rect[] = [];
        const flowTexts = document.querySelectorAll('.tilepage-flow-text');
        for (const ft of Array.from(flowTexts)) {
          const walker = document.createTreeWalker(ft, NodeFilter.SHOW_TEXT);
          let node: Node | null = walker.nextNode();
          while (node) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const rects = range.getClientRects();
            for (const r of Array.from(rects)) {
              if (r.width === 0 || r.height === 0) continue;
              out.push({ x: r.x, y: r.y, width: r.width, height: r.height });
            }
            node = walker.nextNode();
          }
        }
        return out;
      });

      for (const tr of textNodeRects) {
        const intersects = rectsIntersect(titleBox, tr);
        expect(
          intersects,
          `main-title が flow-text rect ${JSON.stringify(tr)} と交差 (titleBox=${JSON.stringify(titleBox)})`,
        ).toBe(false);
      }

      // 観点 4: 拡大スクショ + clip 4 辺包含 assert。
      const padding = 50;
      const clip = {
        x: Math.max(0, titleBox.x - padding),
        y: Math.max(0, titleBox.y - padding),
        width: titleBox.width + padding * 2,
        height: titleBox.height + padding * 2,
      };
      // clip が h1 bbox を 4 辺すべてで完全包含することを assert (v0.5.5 の clip 計算ミス再演防止)。
      expect(clip.x, 'clip.x <= bbox.x').toBeLessThanOrEqual(titleBox.x);
      expect(clip.y, 'clip.y <= bbox.y').toBeLessThanOrEqual(titleBox.y);
      expect(clip.x + clip.width, 'clip 右辺 >= bbox 右辺').toBeGreaterThanOrEqual(
        titleBox.x + titleBox.width,
      );
      expect(clip.y + clip.height, 'clip 下辺 >= bbox 下辺').toBeGreaterThanOrEqual(
        titleBox.y + titleBox.height,
      );

      await page.screenshot({
        path: `e2e/_screenshots/define-headline-horizontal-${v.name}.png`,
        clip,
      });
    });

    test(`全 obstacle は本文 flow text と交差しない (N=${v.expectedN})`, async ({ page }) => {
      // 同一 column に複数 obstacle の float が積まれると後発の shape 座標が block 方向に
      // ずれて本文が obstacle に流入する事故を検出する (main-title + king @ N=2 で顕在化した)。
      // circle / polygon shape は bbox 角の外側 (shape 外) に text が流れるのが仕様なので、
      // clip-path polygon を実座標に展開して shape polygon vs text rect で交差判定する。
      const collisions = await page.evaluate(() => {
        type Pt = [number, number];
        interface Box {
          x: number;
          y: number;
          width: number;
          height: number;
        }
        // clip-path 'polygon(x% y%, ...)' を bbox 実座標の頂点列に展開。 無ければ bbox 4 隅。
        const shapePolygonOf = (el: Element, o: DOMRect): Pt[] => {
          const clip = (el as HTMLElement).style.clipPath;
          const m = clip?.match(/^polygon\((.+)\)$/);
          if (m) {
            const pts: Pt[] = [];
            for (const pair of m[1].split(',')) {
              const nums = pair.trim().match(/^([\d.]+)%\s+([\d.]+)%$/);
              if (!nums) return corners(o);
              pts.push([
                o.left + (Number.parseFloat(nums[1]) / 100) * o.width,
                o.top + (Number.parseFloat(nums[2]) / 100) * o.height,
              ]);
            }
            if (pts.length >= 3) return pts;
          }
          return corners(o);
        };
        const corners = (o: DOMRect): Pt[] => [
          [o.left, o.top],
          [o.right, o.top],
          [o.right, o.bottom],
          [o.left, o.bottom],
        ];
        const pointInPolygon = ([px, py]: Pt, poly: Pt[]): boolean => {
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [xi, yi] = poly[i];
            const [xj, yj] = poly[j];
            if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
              inside = !inside;
            }
          }
          return inside;
        };
        const segmentsIntersect = (a: Pt, b: Pt, c: Pt, d: Pt): boolean => {
          const cross = (o: Pt, p: Pt, q: Pt) =>
            (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
          const d1 = cross(c, d, a);
          const d2 = cross(c, d, b);
          const d3 = cross(a, b, c);
          const d4 = cross(a, b, d);
          return (
            ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
          );
        };
        // subpixel の接触を誤検出しないため text rect を 1px 縮めて判定する。
        const polygonIntersectsRect = (poly: Pt[], r: DOMRect): boolean => {
          const eps = 1;
          const rc: Pt[] = [
            [r.left + eps, r.top + eps],
            [r.right - eps, r.top + eps],
            [r.right - eps, r.bottom - eps],
            [r.left + eps, r.bottom - eps],
          ];
          if (rc[0][0] >= rc[1][0] || rc[0][1] >= rc[3][1]) return false;
          if (rc.some((p) => pointInPolygon(p, poly))) return true;
          if (
            poly.some(
              (p) => p[0] > rc[0][0] && p[0] < rc[1][0] && p[1] > rc[0][1] && p[1] < rc[3][1],
            )
          )
            return true;
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            for (let j = 0; j < 4; j++) {
              if (segmentsIntersect(a, b, rc[j], rc[(j + 1) % 4])) return true;
            }
          }
          return false;
        };

        const found: Array<{ id: string; obstacle: Box; text: Box }> = [];
        const obstacles = document.querySelectorAll('.tilepage-obstacle');
        for (const el of Array.from(obstacles)) {
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const o = el.getBoundingClientRect();
          if (o.width === 0 || o.height === 0) continue;
          const poly = shapePolygonOf(el, o);
          for (const ft of Array.from(document.querySelectorAll('.tilepage-flow-text'))) {
            const walker = document.createTreeWalker(ft, NodeFilter.SHOW_TEXT);
            let node: Node | null = walker.nextNode();
            while (node) {
              const range = document.createRange();
              range.selectNodeContents(node);
              for (const r of Array.from(range.getClientRects())) {
                if (r.width === 0 || r.height === 0) continue;
                if (polygonIntersectsRect(poly, r)) {
                  found.push({
                    id: el.getAttribute('data-id') ?? '(unnamed)',
                    obstacle: { x: o.x, y: o.y, width: o.width, height: o.height },
                    text: { x: r.x, y: r.y, width: r.width, height: r.height },
                  });
                }
              }
              node = walker.nextNode();
            }
          }
        }
        return found;
      });
      expect(collisions, JSON.stringify(collisions.slice(0, 5))).toEqual([]);
    });
  });
}
