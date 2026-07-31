import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { visibleTextOf } from './helpers/visibleText';
import { waitForTilePageReady } from './helpers/waitForTilePageReady';

// Sprint 2: RED test。 columns-variant demo の supportedColumns / whenColumns / line グリッド
// 配置を E2E で検証する。 Sprint 3/4 で実装される API への期待を assertion として固定する。
//
// 検査内容 (各 viewport で独立に走らせる):
// 1. book root に data-active-columns="N" が付く (Sprint 3)
// 2. 各 obstacle が whenColumns[N] の (col, line) で grid 配置される (Sprint 4)
// 3. variant 未定義の N で obstacle が display:none または DOM 不在 (Sprint 4)
// 4. visible text V === SOURCE_TEXT (Sprint 5 の評価軸 #5)

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_TEXT = readFileSync(resolve(__dirname, '../demo/meros.txt'), 'utf8').trim();

// viewport → 期待 N の対応表。 docs/design/v0.4-columns-variant.md L73-79 の例と一致。
// breakpoints: { 8: '90em', 6: '60em', 4: '40em', 2: '0' } @ 16px font。
const CASES: ReadonlyArray<{
  width: number;
  height: number;
  expectedN: number;
}> = [
  { width: 320, height: 800, expectedN: 2 },
  { width: 640, height: 800, expectedN: 4 },
  { width: 1024, height: 800, expectedN: 6 },
  { width: 1440, height: 900, expectedN: 8 },
];

// demo/e2e/fixtures/columns-variant/main.ts の whenColumns 宣言と同期 (起点座標のみ)。
// lines は aspect / natural aspect から動的に決まるので assertion 対象外。
// 「king」は N=6 を意図的に省略。 graceful degrade のテスト対象。
type VariantSpec = { col: number; line: number; cols: number };
const EXPECTED_PLACEMENT: Record<string, Record<number, VariantSpec | null>> = {
  king: {
    2: { col: 1, line: 1, cols: 2 },
    4: { col: 1, line: 1, cols: 2 },
    6: null, // 意図的に省略 → display:none / 非存在
    8: { col: 1, line: 1, cols: 3 },
  },
  run: {
    2: { col: 1, line: 10, cols: 2 },
    4: { col: 3, line: 3, cols: 2 },
    6: { col: 4, line: 5, cols: 2 },
    8: { col: 5, line: 4, cols: 3 },
  },
  reunion: {
    2: { col: 1, line: 1, cols: 2 },
    4: { col: 2, line: 2, cols: 2 },
    6: { col: 3, line: 3, cols: 2 },
    8: { col: 4, line: 4, cols: 3 },
  },
};

for (const { width, height, expectedN } of CASES) {
  test.describe(`columns-variant @ viewport ${width}x${height} (N=${expectedN})`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page }) => {
      await page.goto('/e2e/fixtures/columns-variant/');
      await page.waitForSelector('#app[data-ready="true"]');
      await waitForTilePageReady(page);
    });

    test(`book root has data-active-columns="${expectedN}"`, async ({ page }) => {
      const actual = await page
        .locator('.tilepage-book')
        .first()
        .getAttribute('data-active-columns');
      expect(actual).toBe(String(expectedN));
    });

    for (const obstacleId of ['king', 'run', 'reunion'] as const) {
      const expected = EXPECTED_PLACEMENT[obstacleId][expectedN];
      const locator = (page: import('@playwright/test').Page) =>
        page.locator(`.tilepage-obstacle[data-id="${obstacleId}"]`);

      if (expected === null) {
        test(`obstacle[data-id=${obstacleId}] is hidden (variant undefined for N=${expectedN})`, async ({
          page,
        }) => {
          const el = locator(page);
          const count = await el.count();
          if (count === 0) {
            // DOM 不在も許容 (degrade の取りうる表現)。
            expect(count).toBe(0);
            return;
          }
          await expect(el).toBeHidden();
        });
      } else {
        test(`obstacle[data-id=${obstacleId}] is placed at (col=${expected.col}, line=${expected.line})`, async ({
          page,
        }) => {
          const el = locator(page);
          await expect(el).toBeVisible();
          const { gridColumnStart, gridRowStart } = await el.evaluate((node) => {
            const cs = window.getComputedStyle(node);
            return {
              gridColumnStart: cs.gridColumnStart,
              gridRowStart: cs.gridRowStart,
            };
          });
          expect(gridColumnStart).toBe(String(expected.col));
          expect(gridRowStart).toBe(String(expected.line));
        });
      }
    }

    test(`visible text V === SOURCE_TEXT (N=${expectedN})`, async ({ page }) => {
      const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
      // 改行 (\n) は visibleTextOf が rect 0-size の境界文字として扱い、 column 末端の
      // clip と相互作用する場合に拾えないことがある。 評価軸 #5 (文字数照合) は改行を
      // 除いた本文一致で担保する。
      const stripNewlines = (s: string): string => s.replace(/\n/g, '');
      expect(stripNewlines(V)).toBe(stripNewlines(SOURCE_TEXT));
      expect(stripNewlines(V).length).toBe(stripNewlines(SOURCE_TEXT).length);
    });
  });
}
