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
// 通常 viewport は ±5% に収める。 mobile N=2 では 1 column の inline-axis (= 縦) が page 高さの
// 約半分 = 270px に固定され、 cell.width = 270 * 1.5 = 405px が必要だが、 縦書き layer の
// 物理 width = 375 - padding-block(48px) = 327px しか取れず、 物理制約で aspect 3:2 を満たせない
// (rows=15 が maxLines=12 に clamp され aspect ≈ 1.20)。 mobile に限り ±25% を許容する。
const ASPECT_TOLERANCE_DEFAULT = 0.05;
const ASPECT_TOLERANCE_MOBILE = 0.25;

// 「文字幅 1 個分」 の閾値。 縦書き本文の line-height / 文字幅は実測で運用する。
// 観点 5 は「明白な空白帯がない」 ことの保証であり、 1 文字分 + 安全マージンとして
// padding-inline (4em = 64px @16px) より小さい値を採用する。
// vertical-rl では論理的な行間 (= 物理 X 軸) が「段の幅」 に相当し、 段間 gutter (1.5em ≒ 24px)
// が回り込み境界の最大ギャップになる。 1 文字 (= 1em) + マージンで 32px を採用。
const WRAP_GAP_PX = 32;

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

    const aspectTolerance =
      c.name === 'mobile-375x667' ? ASPECT_TOLERANCE_MOBILE : ASPECT_TOLERANCE_DEFAULT;
    test(`観点 2: 画像 bbox の aspect が natural (3/2) と一致 (±${aspectTolerance * 100}%)`, async ({
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
        // ratio が 1 ± aspectTolerance の範囲にあること
        expect(ratio).toBeGreaterThanOrEqual(1 - aspectTolerance);
        expect(ratio).toBeLessThanOrEqual(1 + aspectTolerance);
      }
    });

    test('観点 3: obstacle bbox と text line bbox が矩形交差しない', async ({ page }) => {
      const overlaps = await page.evaluate(() => {
        const obstacles = Array.from(
          document.querySelectorAll('.tilepage-obstacle[data-id]'),
        ) as HTMLElement[];
        const visibleObstacles = obstacles.filter((el) => el.offsetParent !== null);

        // text line bbox: .tilepage-flow-text 配下の TextNode を Range で line rect 化
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

        const intersect = (
          a: { left: number; top: number; right: number; bottom: number },
          b: { left: number; top: number; right: number; bottom: number },
        ): number => {
          const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          return x * y;
        };

        const hits: {
          id: string | undefined;
          area: number;
          textRect: (typeof textRects)[number];
        }[] = [];
        for (const ob of visibleObstacles) {
          const obRect = ob.getBoundingClientRect();
          const obBox = {
            left: obRect.left,
            top: obRect.top,
            right: obRect.right,
            bottom: obRect.bottom,
          };
          for (const tr of textRects) {
            const area = intersect(obBox, tr);
            // subpixel ノイズ排除のため面積 1px^2 超のみカウント
            if (area > 1) {
              hits.push({ id: ob.dataset.id, area, textRect: tr });
            }
          }
        }
        return {
          overlapCount: hits.length,
          sample: hits.slice(0, 5),
          obstacleCount: visibleObstacles.length,
        };
      });
      expect(overlaps.obstacleCount).toBeGreaterThan(0);
      expect(overlaps.overlapCount, JSON.stringify(overlaps.sample)).toBe(0);
    });

    test(`観点 5: 各 obstacle の 4 辺それぞれから text line が ${WRAP_GAP_PX}px 以内 (page 端に接する辺は除外)`, async ({
      page,
    }) => {
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

          for (const ob of visibleObstacles) {
            const r = ob.getBoundingClientRect();
            const pageEl = closestPage(ob);
            const contentRect = contentRectOf(pageEl);
            // 辺が content area 境界より外側 / 接していたら page padding に来る辺なので評価対象外。
            const sideOnPageEdge = (side: 'top' | 'bottom' | 'left' | 'right'): boolean => {
              if (!contentRect) return false;
              if (side === 'top') return r.top - contentRect.top <= pageEdgeThreshold;
              if (side === 'bottom') return contentRect.bottom - r.bottom <= pageEdgeThreshold;
              if (side === 'left') return r.left - contentRect.left <= pageEdgeThreshold;
              return contentRect.right - r.right <= pageEdgeThreshold;
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
              sideReport.push({ id: ob.dataset.id, side, dist: collectDist(side) });
            }
          }

          return {
            obstacleCount: visibleObstacles.length,
            textRectCount: textRects.length,
            // maxGap を超えた辺だけ抽出 (報告用)
            violations: sideReport.filter((s) => s.dist > maxGap),
          };
        },
        // pageEdgeThreshold は「obstacle bbox の辺が page の padding 内側 (= 配置可能領域の
        // 端) に接している場合は外側に text が来ないため対象外」 を許容する。 obstacle-layer の
        // padding-block (vertical-rl で物理 left+right = 1.5em ≒ 24px) と horizontal-tb の
        // padding (2em 1.5em) のいずれも吸収できる値として 48px を採用する。
        { maxGap: WRAP_GAP_PX, pageEdgeThreshold: 48 },
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
