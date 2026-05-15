import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { visibleTextOf } from './helpers/visibleText';

// N=1 inline 画像配置の E2E。
// viewport 320 (< 24em=384px) で supportedColumns の最小値 N=1 が選ばれる。
// king: 全幅 / run: 右 50% / reunion: 左 60% (page=2)
// 部分幅 obstacle の bounding rect から実 inline-size を測り、 column 幅との比率を検証。

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_TEXT = readFileSync(resolve(__dirname, '../demo/meros.txt'), 'utf8').trim();

test.describe('TilePage N=1 inline image placement @ viewport 320', () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app[data-ready="true"]');
    await page.waitForSelector('.tilepage-book');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('book root has data-active-columns="1"', async ({ page }) => {
    const actual = await page.locator('.tilepage-book').first().getAttribute('data-active-columns');
    expect(actual).toBe('1');
  });

  test('各 obstacle が whenColumns[1] の (col, line) で grid 配置される', async ({ page }) => {
    const cases = [
      { id: 'king', col: '1', row: '1' },
      { id: 'run', col: '1', row: '12' },
      { id: 'reunion', col: '1', row: '1' },
    ];
    for (const c of cases) {
      const el = page.locator(`.tilepage-obstacle[data-id="${c.id}"]`);
      await expect(el).toBeVisible();
      const { col, row } = await el.evaluate((node) => {
        const cs = window.getComputedStyle(node);
        return { col: cs.gridColumnStart, row: cs.gridRowStart };
      });
      expect(col).toBe(c.col);
      expect(row).toBe(c.row);
    }
  });

  test('king は inline-size=100%、 run は ~50%、 reunion は ~60% (column 幅に対する比率)', async ({
    page,
  }) => {
    // column 幅は flow-layer の inline 軸 (N=1 なので column = column 1 のみ)。
    const columnWidth = await page
      .locator('.tilepage-page')
      .first()
      .locator('.tilepage-column')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(columnWidth).toBeGreaterThan(0);

    const ratioOf = async (id: string): Promise<number> => {
      const w = await page
        .locator(`.tilepage-obstacle[data-id="${id}"]`)
        .first()
        .evaluate((el) => el.getBoundingClientRect().width);
      return w / columnWidth;
    };
    const kingRatio = await ratioOf('king');
    const runRatio = await ratioOf('run');
    const reunionRatio = await ratioOf('reunion');
    // 許容誤差 ±5% (column-gap 等の微小ずれを吸収。 column 幅自体は flow-layer 全幅)。
    expect(kingRatio).toBeGreaterThan(0.95);
    expect(kingRatio).toBeLessThanOrEqual(1.01);
    expect(runRatio).toBeGreaterThan(0.45);
    expect(runRatio).toBeLessThan(0.55);
    expect(reunionRatio).toBeGreaterThan(0.55);
    expect(reunionRatio).toBeLessThan(0.65);
  });

  test('visible text V === SOURCE_TEXT (改行除外で文字数照合)', async ({ page }) => {
    const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
    const stripNewlines = (s: string): string => s.replace(/\n/g, '');
    expect(stripNewlines(V)).toBe(stripNewlines(SOURCE_TEXT));
    expect(stripNewlines(V).length).toBe(stripNewlines(SOURCE_TEXT).length);
  });
});
