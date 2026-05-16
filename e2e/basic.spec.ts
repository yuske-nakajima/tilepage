import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { visibleTextOf } from './helpers/visibleText';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_TEXT = readFileSync(resolve(__dirname, '../demo/meros.txt'), 'utf8').trim();

// root demo は supportedColumns: [2,4,6,8] + breakpoints + whenColumns で構成される。
// viewport を明示固定して N を決定し、 king variant が N=6 で意図的に省略される
// graceful degradation 挙動を assert する。
//   1024px >= 60em (=960px) → N=6 が選ばれる
//   N=6 では king variant 未定義 → display:none、 run/reunion は表示
test.describe('TilePage demo (走れメロス / supportedColumns + whenColumns @ N=6)', () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.tilepage-book');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('book root has data-active-columns="6"', async ({ page }) => {
    await expect(page.locator('.tilepage-book')).toBeVisible();
    const n = await page.locator('.tilepage-book').first().getAttribute('data-active-columns');
    expect(n).toBe('6');
  });

  test('page と column 数は data-active-columns に揃う', async ({ page }) => {
    const pageCount = await page.locator('.tilepage-page').count();
    expect(pageCount).toBeGreaterThanOrEqual(2);
    const firstPageColumns = await page
      .locator('.tilepage-page')
      .first()
      .locator('.tilepage-column')
      .count();
    expect(firstPageColumns).toBe(6);
    await expect(page.locator('.tilepage-column')).toHaveCount(pageCount * firstPageColumns);
  });

  test('king variant は N=6 で省略され DOM 不在または display:none になる (graceful degrade)', async ({
    page,
  }) => {
    const king = page.locator('.tilepage-obstacle[data-id="king"]');
    const count = await king.count();
    if (count === 0) {
      // 一度も attach されないまま detached → DOM 不在は graceful degrade の取りうる表現。
      expect(count).toBe(0);
      return;
    }
    await expect(king).toBeHidden();
    const whenAttr = await king.getAttribute('data-when-columns');
    expect(whenAttr === '' || whenAttr === null).toBe(true);
  });

  test('run / reunion variant は N=6 で表示される', async ({ page }) => {
    const run = page.locator('.tilepage-obstacle[data-id="run"]');
    const reunion = page.locator('.tilepage-obstacle[data-id="reunion"]');
    await expect(run).toBeVisible();
    await expect(reunion).toBeVisible();
    const runWhen = await run.getAttribute('data-when-columns');
    const reunionWhen = await reunion.getAttribute('data-when-columns');
    expect(runWhen).toBe('6');
    expect(reunionWhen).toBe('6');
  });

  test('表示中 obstacle の grid 配置は whenColumns[6] と一致する', async ({ page }) => {
    const run = page.locator('.tilepage-obstacle[data-id="run"]');
    const runStyle = await run.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { col: cs.gridColumnStart, row: cs.gridRowStart };
    });
    // demo/main.ts: run @ N=6 → page 1, col=4, line=5, cols=2, lines=6
    expect(runStyle.col).toBe('4');
    expect(runStyle.row).toBe('5');

    const reunion = page.locator('.tilepage-obstacle[data-id="reunion"]');
    const reunionStyle = await reunion.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { col: cs.gridColumnStart, row: cs.gridRowStart };
    });
    // demo/main.ts: reunion @ N=6 → page 2, col=3, line=3, cols=2, lines=6
    expect(reunionStyle.col).toBe('3');
    expect(reunionStyle.row).toBe('3');
  });

  test('circle / polygon obstacle に clip-path が同期される', async ({ page }) => {
    const run = page.locator('.tilepage-obstacle[data-id="run"]');
    const reunion = page.locator('.tilepage-obstacle[data-id="reunion"]');
    const runClip = await run.evaluate((el) => el.style.clipPath);
    const reunionClip = await reunion.evaluate((el) => el.style.clipPath);
    expect(runClip).toContain('polygon(');
    expect(reunionClip).toContain('polygon(');
  });

  test('book 全体の visible text が source と厳密一致 (duplicate なし)', async ({ page }) => {
    const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
    expect(V).toBe(SOURCE_TEXT);
    expect(V.length).toBe(SOURCE_TEXT.length);
  });
});
