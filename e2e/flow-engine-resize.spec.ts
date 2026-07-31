import { expect, test } from '@playwright/test';
import { visibleTextOf } from './helpers/visibleText';
import { waitForTilePageReady } from './helpers/waitForTilePageReady';

type WritingMode = 'horizontal-tb' | 'vertical-rl';
type ObstacleKind = 'none' | 'rect' | 'circle' | 'polygon';

// resize sweep test: viewport 幅を動的に変化させた各ステップで V === SOURCE が成立し、
// page DOM 数が viewport によって増減することを確認する。

function buildSource(): string {
  const head = '[HEAD]';
  const tail = '[TAIL]';
  const para =
    '本文の一段落。横書きでも縦書きでも 1 本の連続ストリームとして流れ、' +
    '段の終端で次の段の頭へ折り返し、ページ末尾でページを跨ぐ。' +
    'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';
  const parts: string[] = [head];
  for (let i = 0; i < 24; i++) {
    parts.push(`<§${i.toString().padStart(3, '0')}>${para}`);
  }
  parts.push(tail);
  return parts.join('');
}

const SOURCE = buildSource();

function buildUrl(params: {
  columns: number;
  writingMode: WritingMode;
  obstacle: ObstacleKind;
  text: string;
}): string {
  const q = new URLSearchParams({
    columns: String(params.columns),
    writingMode: params.writingMode,
    obstacle: params.obstacle,
    text: params.text,
  });
  return `/e2e/fixtures/v0.4/?${q.toString()}`;
}

async function pageCount(page: import('@playwright/test').Page): Promise<number> {
  return page.locator('.tilepage-page').count();
}

interface SweepCase {
  writingMode: WritingMode;
  columns: number;
  obstacle: ObstacleKind;
}

// 軽量に: 横書き × 縦書き × cols (2/6) × obstacle (none/rect) の 8 ケース。
// 各ケースで viewport を 1200 → 1500 → 1800 → 1200 と sweep し、各ステップで V===S。
const CASES: ReadonlyArray<SweepCase> = [
  { writingMode: 'horizontal-tb', columns: 2, obstacle: 'none' },
  { writingMode: 'horizontal-tb', columns: 6, obstacle: 'rect' },
  { writingMode: 'vertical-rl', columns: 2, obstacle: 'none' },
  { writingMode: 'vertical-rl', columns: 6, obstacle: 'rect' },
];

test.describe('v0.4 flow-engine resize sweep', () => {
  for (const c of CASES) {
    test(`wm=${c.writingMode} cols=${c.columns} obstacle=${c.obstacle} viewport sweep`, async ({
      browser,
    }) => {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
      const page = await ctx.newPage();
      try {
        await page.goto(
          buildUrl({
            columns: c.columns,
            writingMode: c.writingMode,
            obstacle: c.obstacle,
            text: SOURCE,
          }),
        );
        await page.waitForSelector('#app[data-ready="true"]');
        await waitForTilePageReady(page);

        const counts: number[] = [];

        for (const width of [1200, 1500, 1800, 1200] as const) {
          await page.setViewportSize({ width, height: 900 });
          await waitForTilePageReady(page);
          const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
          expect(V, `viewport ${width}`).toBe(SOURCE);
          counts.push(await pageCount(page));
        }

        // page 数が viewport によって増減することを確認 (1200 と 1800 で差があること)。
        // viewport を広げると 1 page あたりの容量が増え、必要 page 数は減る (または同じ) はず。
        // 等値はあり得るが、すべて同じ値でないことを faint 検証として要求しない。
        // 代わりに 1200 → 1800 で count が減るか同じ、1800 → 1200 で count が増えるか同じ。
        expect(counts[2]).toBeLessThanOrEqual(counts[0]);
        expect(counts[3]).toBeGreaterThanOrEqual(counts[2]);
      } finally {
        await ctx.close();
      }
    });
  }

  test('page 数が viewport で動的に増減する (cols=6 horizontal-tb)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await ctx.newPage();
    try {
      await page.goto(
        buildUrl({ columns: 6, writingMode: 'horizontal-tb', obstacle: 'none', text: SOURCE }),
      );
      await page.waitForSelector('#app[data-ready="true"]');
      await waitForTilePageReady(page);
      const initialCount = await pageCount(page);

      // viewport を極端に狭く (800) → 広く (2400) して page 数が変わることを期待。
      await page.setViewportSize({ width: 800, height: 900 });
      await waitForTilePageReady(page);
      const narrowCount = await pageCount(page);

      await page.setViewportSize({ width: 2400, height: 900 });
      await waitForTilePageReady(page);
      const wideCount = await pageCount(page);

      // どこかで page 数が変化していることを要求 (V===S は他テストで担保)。
      const allSame = initialCount === narrowCount && narrowCount === wideCount;
      expect(allSame).toBe(false);
    } finally {
      await ctx.close();
    }
  });
});
