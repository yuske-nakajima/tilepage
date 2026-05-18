import { expect, test } from '@playwright/test';

// Sprint 4: 縦書き vertical-meros demo の 5 観点 + scroll-snap 維持を assert する E2E。
//
// 観点 1: N 切替 (1920x1080→N=8 / 1024x768→N=4 / 375x667→N=2)
// 観点 2: 画像 aspect (bbox width/height ≒ natural aspect、 許容 ±5%)
// 観点 3: 画像と本文の矩形交差 = 0 (各 obstacle bbox × 各 text line bbox の交差 px = 0)
// 観点 4: data-when-columns が viewport ごとに 2/4/6/8 のいずれかに切り替わる
// 観点 5: 画像周囲のテキスト回り込み (各画像 bbox の 4 辺それぞれから文字幅 1 個分以内に text line)
// scroll-snap: book root の scroll-snap-type が 'y mandatory'
//
// 内部実装の関数名 (normalizeVerticalWhenColumns 等) には触れない。
// 外部から観測可能な属性 (data-*, getBoundingClientRect, computed style) のみで判定する。

interface CaseDef {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly expectedN: 2 | 4 | 8;
}

const CASES: ReadonlyArray<CaseDef> = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080, expectedN: 8 },
  { name: 'tablet-1024x768', width: 1024, height: 768, expectedN: 4 },
  { name: 'mobile-375x667', width: 375, height: 667, expectedN: 2 },
];

// 走れメロス画像 3 枚の natural aspect (width / height)。
// 1536 x 1024 = 1.5 (= 3/2)。
const NATURAL_ASPECT = 3 / 2;
// 全 viewport で ±5% を厳格に課す。
const ASPECT_TOLERANCE = 0.05;

// 「文字幅 1 個分」 の閾値。 縦書き本文の line-height / 文字幅は実測で運用する。
// 観点 5 は「明白な空白帯がない」 ことの保証であり、 1 文字分 + 安全マージンとして
// padding-inline (4em = 64px @16px) より小さい値を採用する。
// vertical-rl では論理的な行間 (= 物理 X 軸) が「段の幅」 に相当し、 段間 gutter (1.5em ≒ 24px)
// が回り込み境界の最大ギャップになる。 1 文字 (= 1em) + マージンで 32px を採用。
const WRAP_GAP_PX = 32;

// 観点 5 で「obstacle 辺が page 配置可能領域端に接している場合は対象外」 を判定する閾値。
// obstacle-layer の padding (gutter 0.75em + 余裕) を吸収する 4px。
const PAGE_EDGE_THRESHOLD_PX = 4;

for (const c of CASES) {
  test.describe(`vertical-meros @ ${c.name}`, () => {
    test.use({ viewport: { width: c.width, height: c.height } });

    test.beforeEach(async ({ page }) => {
      await page.goto('/vertical-meros/');
      await page.waitForSelector('.tilepage-book');
      await page.waitForLoadState('networkidle');
      // 画像 load → variant 再解決 → reflow の追従待ち
      await page.waitForTimeout(800);
    });

    test(`観点 1: 段数 N=${c.expectedN} に切り替わる (data-active-columns)`, async ({ page }) => {
      const actual = await page
        .locator('.tilepage-book')
        .first()
        .getAttribute('data-active-columns');
      expect(actual).toBe(String(c.expectedN));
    });

    test(`観点 4: 各 obstacle の data-when-columns が ${c.expectedN} に切り替わる`, async ({
      page,
    }) => {
      const values = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll('.tilepage-obstacle[data-id]'),
        ) as HTMLElement[];
        return els
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({ id: el.dataset.id, whenColumns: el.dataset.whenColumns }));
      });
      // 1 個以上の visible obstacle が当該 viewport で出ていること
      expect(values.length).toBeGreaterThan(0);
      for (const v of values) {
        expect([2, 4, 6, 8]).toContain(Number(v.whenColumns));
        expect(v.whenColumns).toBe(String(c.expectedN));
      }
    });

    test(`観点 2: 画像 bbox の aspect が natural (3/2) と一致 (±${ASPECT_TOLERANCE * 100}%)`, async ({
      page,
    }) => {
      const boxes = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll('.tilepage-obstacle[data-id]'),
        ) as HTMLElement[];
        return els
          .filter((el) => el.offsetParent !== null)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { id: el.dataset.id, width: r.width, height: r.height };
          });
      });
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) {
        // 描画 0 サイズはこの観点で判定不能なので skip 用に明示 fail
        expect(b.width).toBeGreaterThan(0);
        expect(b.height).toBeGreaterThan(0);
        const observed = b.width / b.height;
        const ratio = observed / NATURAL_ASPECT;
        // ratio が 1 ± ASPECT_TOLERANCE の範囲にあること
        expect(ratio).toBeGreaterThanOrEqual(1 - ASPECT_TOLERANCE);
        expect(ratio).toBeLessThanOrEqual(1 + ASPECT_TOLERANCE);
      }
    });

    test('観点 3: 全 shape (rect/circle/polygon) で「画像の clip 内側」 に本文 text が侵食しない', async ({
      page,
    }) => {
      // bbox 交差は circle/polygon で bbox 内 / shape 外の text rect を拾うため不適当
      // (横書きでも同じ理由で bbox 交差 0 は成り立たない)。
      // 「画像と本文が物理的に重なっている」 という観点 3 の本質を満たすには、
      // 「画像の clip-path 可視領域内に text rect が侵食しているか」 を点ベースで判定する。
      // 各 obstacle の bbox を 24×24 grid でサンプルし、 サンプル点が clip 可視領域内かつ
      // text node が前面にあれば「侵食」 とみなす。 elementsFromPoint で z-index 順の上位 5 要素を
      // 取得し、 obstacle 自身より上に flow-text の text node が来ているかで判定する。
      const result = await page.evaluate(() => {
        const obstacles = Array.from(
          document.querySelectorAll('.tilepage-obstacle[data-id]'),
        ) as HTMLElement[];
        const visibleObstacles = obstacles.filter((el) => el.offsetParent !== null);
        const SAMPLES = 24;
        const hits: Array<{ id: string | undefined; shape: string; x: number; y: number }> = [];
        for (const ob of visibleObstacles) {
          const r = ob.getBoundingClientRect();
          const cp = window.getComputedStyle(ob).clipPath;
          const shape =
            cp === 'none' || cp === '' || cp.startsWith('inset(') ? 'rect' : cp.slice(0, 24);
          // clip-path 可視領域の境界を簡易化: rect / circle / polygon を判定
          const insideClip = (px: number, py: number): boolean => {
            const lx = (px - r.left) / r.width;
            const ly = (py - r.top) / r.height;
            if (lx < 0 || lx > 1 || ly < 0 || ly > 1) return false;
            if (cp === 'none' || cp === '' || cp.startsWith('inset(')) return true;
            if (cp.startsWith('circle(')) {
              // circle(closest-side) で中心 (0.5, 0.5)、 半径 = min(0.5, 0.5) = 0.5
              const dx = lx - 0.5;
              const dy = ly - 0.5;
              const rx = r.width / 2;
              const ry = r.height / 2;
              return (
                (dx * dx) / ((rx * rx) / (r.width * r.width)) +
                  (dy * dy) / ((ry * ry) / (r.height * r.height)) <=
                1
              );
            }
            // polygon は点座標を切り出して point-in-polygon 判定
            const m = cp.match(/polygon\(([^)]+)\)/);
            if (!m) return true;
            const pts: Array<[number, number]> = m[1]
              .split(',')
              .map((s) => s.trim().split(/\s+/))
              .map(([sx, sy]) => [Number.parseFloat(sx) / 100, Number.parseFloat(sy) / 100]);
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
              const [xi, yi] = pts[i];
              const [xj, yj] = pts[j];
              const intersect =
                yi > ly !== yj > ly && lx < ((xj - xi) * (ly - yi)) / (yj - yi) + xi;
              if (intersect) inside = !inside;
            }
            return inside;
          };
          for (let i = 1; i < SAMPLES; i++) {
            for (let j = 1; j < SAMPLES; j++) {
              const px = r.left + (r.width * i) / SAMPLES;
              const py = r.top + (r.height * j) / SAMPLES;
              if (!insideClip(px, py)) continue;
              // elementsFromPoint で重なる順に上位を取り、 flow-text の text node が含まれていれば侵食
              const stack = document.elementsFromPoint(px, py);
              for (const el of stack) {
                if (el === ob) break; // obstacle が前面なら text 侵食なし
                if ((el as Element).closest?.('.tilepage-flow-text')) {
                  hits.push({ id: ob.dataset.id, shape, x: px, y: py });
                  break;
                }
              }
            }
          }
        }
        return {
          overlapCount: hits.length,
          sample: hits.slice(0, 10),
          obstacleCount: visibleObstacles.length,
        };
      });
      expect(result.obstacleCount).toBeGreaterThan(0);
      expect(result.overlapCount, JSON.stringify(result.sample)).toBe(0);
    });

    test(`観点 5: 各 obstacle の 4 辺それぞれから text line が ${WRAP_GAP_PX}px 以内 (page 端に接する辺は除外、 cell-img gap 内は許容)`, async ({
      page,
    }) => {
      // Sprint 6 #2 spec 拡大: 縦書きで cell 物理 aspect と user 指定 aspect が乖離するケース
      // (mobile vertical N=2 等) では、 algorithm が bbox を cell より小さく縮める。 縮めた gap は
      // shape-outside 範囲外なので text が gap 内に回り込む。 観点 5 はこの gap 分の距離も「許容」
      // するため、 obstacle が data-cell-img-gap-inline / -block を持つ場合、 該当軸の許容閾値を
      // gap 分だけ拡張する (= 旧 spec: bbox 周辺 maxGap → 新 spec: bbox + cell gap 周辺 maxGap)。
      // vertical-rl + align/justify-self: start の構造上、 gap は inline-end (物理 bottom) /
      // block-end (物理 left) 側のみに発生する (cell の start 側に寄せて配置されるため)。
      const result = await page.evaluate(
        ({ maxGap, pageEdgeThreshold }) => {
          const obstacles = Array.from(
            document.querySelectorAll('.tilepage-obstacle[data-id]'),
          ) as HTMLElement[];
          const visibleObstacles = obstacles.filter((el) => el.offsetParent !== null);

          const textRects: { left: number; top: number; right: number; bottom: number }[] = [];
          const flowTexts = Array.from(
            document.querySelectorAll('.tilepage-flow-text'),
          ) as HTMLElement[];
          for (const root of flowTexts) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let n: Node | null = walker.nextNode();
            while (n) {
              const tn = n as Text;
              const range = document.createRange();
              try {
                range.selectNodeContents(tn);
                const rects = range.getClientRects();
                for (const r of rects) {
                  if (r.width > 0 && r.height > 0) {
                    textRects.push({
                      left: r.left,
                      top: r.top,
                      right: r.right,
                      bottom: r.bottom,
                    });
                  }
                }
              } catch {
                // ignore
              }
              n = walker.nextNode();
            }
          }

          // 各 obstacle が属する page (および obstacle-layer / flow-layer) の content area
          // (padding 内側) を取得し、 obstacle 辺が content area 端より外側 / 接している場合は
          // 観点 5 の対象外とする。 page padding は設計上の余白であり、 obstacle bbox がそこに
          // 接する辺は「page 外側に向く辺」 = 回り込み対象外。
          // 縦書きでは block-start (= 物理右) が常に obstacle-layer padding-block-start 端に
          // 寄るため、 page bbox ではなく content area 端で判定しないと一律 fail になる。
          const closestPage = (el: HTMLElement): HTMLElement | null => {
            let p: HTMLElement | null = el;
            while (p && !p.classList.contains('tilepage-page')) p = p.parentElement;
            return p;
          };
          const contentRectOf = (
            pageEl: HTMLElement | null,
          ): { left: number; top: number; right: number; bottom: number } | null => {
            if (!pageEl) return null;
            const layer = pageEl.querySelector('.tilepage-obstacle-layer') as HTMLElement | null;
            if (!layer) return null;
            const r = layer.getBoundingClientRect();
            const cs = window.getComputedStyle(layer);
            const padL = Number.parseFloat(cs.paddingLeft || '0');
            const padR = Number.parseFloat(cs.paddingRight || '0');
            const padT = Number.parseFloat(cs.paddingTop || '0');
            const padB = Number.parseFloat(cs.paddingBottom || '0');
            return {
              left: r.left + padL,
              top: r.top + padT,
              right: r.right - padR,
              bottom: r.bottom - padB,
            };
          };

          const sideReport: {
            id: string | undefined;
            side: 'top' | 'bottom' | 'left' | 'right';
            dist: number;
          }[] = [];

          // vertical-rl で cell-img gap が発生する側 (= 緩和対象側) を求める。
          // bbox shrink は justify-self/align-self: start で cell の start 側に寄せるため、
          //   inline axis (vertical-rl では Y) gap → 物理 bottom 側に発生
          //   block  axis (vertical-rl では X) gap → 物理 left   側に発生
          // 横書きでは shrink を行わない (algorithm 側で writingMode で gate)。
          // 値は px 単位の文字列。 0 (gap なし) と 0 超の両方が data 属性に書き込まれる。
          const isVertical =
            document.querySelector('.tilepage-page[data-writing-mode="vertical-rl"]') !== null;
          const cellGapFor = (
            ob: HTMLElement,
            side: 'top' | 'bottom' | 'left' | 'right',
          ): number => {
            if (!isVertical) return 0;
            if (ob.dataset.bboxShrunk !== 'true') return 0;
            const gI = Number.parseFloat(ob.dataset.cellImgGapInline ?? '0') || 0;
            const gB = Number.parseFloat(ob.dataset.cellImgGapBlock ?? '0') || 0;
            // vertical-rl, justify-self/align-self: start:
            //   inline axis (Y top→bottom) start = top → gap at bottom (= gapInline)
            //   block  axis (X right→left) start = right → gap at left (= gapBlock)
            if (side === 'bottom') return gI;
            if (side === 'left') return gB;
            return 0;
          };

          for (const ob of visibleObstacles) {
            const r = ob.getBoundingClientRect();
            const pageEl = closestPage(ob);
            const contentRect = contentRectOf(pageEl);
            // 辺が content area 境界より外側 / 接していたら page padding に来る辺なので評価対象外。
            // cell-img gap がある側は cell 端 (= bbox 端 + gap) が page 端に接していれば対象外とみなす。
            const sideOnPageEdge = (side: 'top' | 'bottom' | 'left' | 'right'): boolean => {
              if (!contentRect) return false;
              const gap = cellGapFor(ob, side);
              if (side === 'top') return r.top - gap - contentRect.top <= pageEdgeThreshold;
              if (side === 'bottom')
                return contentRect.bottom - (r.bottom + gap) <= pageEdgeThreshold;
              if (side === 'left') return r.left - gap - contentRect.left <= pageEdgeThreshold;
              return contentRect.right - (r.right + gap) <= pageEdgeThreshold;
            };
            const collectDist = (side: 'top' | 'bottom' | 'left' | 'right'): number => {
              let bestDist = Number.POSITIVE_INFINITY;
              for (const tr of textRects) {
                if (side === 'top') {
                  const hOverlap = tr.right > r.left && tr.left < r.right;
                  if (!hOverlap) continue;
                  if (tr.bottom > r.top) continue;
                  const d = r.top - tr.bottom;
                  if (d < bestDist) bestDist = d;
                } else if (side === 'bottom') {
                  const hOverlap = tr.right > r.left && tr.left < r.right;
                  if (!hOverlap) continue;
                  if (tr.top < r.bottom) continue;
                  const d = tr.top - r.bottom;
                  if (d < bestDist) bestDist = d;
                } else if (side === 'left') {
                  const vOverlap = tr.bottom > r.top && tr.top < r.bottom;
                  if (!vOverlap) continue;
                  if (tr.right > r.left) continue;
                  const d = r.left - tr.right;
                  if (d < bestDist) bestDist = d;
                } else {
                  const vOverlap = tr.bottom > r.top && tr.top < r.bottom;
                  if (!vOverlap) continue;
                  if (tr.left < r.right) continue;
                  const d = tr.left - r.right;
                  if (d < bestDist) bestDist = d;
                }
              }
              return bestDist;
            };

            for (const side of ['top', 'bottom', 'left', 'right'] as const) {
              if (sideOnPageEdge(side)) continue;
              const dist = collectDist(side);
              // cell-img gap がある側はその分許容を引き伸ばす (gap 内に text が流入すれば 0 に近づく)。
              const sideAllowance = cellGapFor(ob, side);
              const adjusted = Math.max(0, dist - sideAllowance);
              sideReport.push({ id: ob.dataset.id, side, dist: adjusted });
            }
          }

          return {
            obstacleCount: visibleObstacles.length,
            textRectCount: textRects.length,
            // maxGap を超えた辺だけ抽出 (報告用)
            violations: sideReport.filter((s) => s.dist > maxGap),
          };
        },
        // pageEdgeThreshold は「obstacle bbox の辺が page の content area 端に厳密に接して
        // いる場合のみ対象外」 を表す。 subpixel ノイズの吸収のみを目的とした 4px。
        { maxGap: WRAP_GAP_PX, pageEdgeThreshold: PAGE_EDGE_THRESHOLD_PX },
      );

      expect(result.obstacleCount).toBeGreaterThan(0);
      expect(result.textRectCount).toBeGreaterThan(0);
      // 4 辺全てが文字幅 1 個分以内 → violations が 0
      expect(result.violations, JSON.stringify(result.violations)).toEqual([]);
    });

    test('scroll-snap: book root の scroll-snap-type が y mandatory', async ({ page }) => {
      const snapType = await page
        .locator('.tilepage-book')
        .first()
        .evaluate((el) => window.getComputedStyle(el).scrollSnapType);
      expect(snapType).toBe('y mandatory');
    });
  });
}
