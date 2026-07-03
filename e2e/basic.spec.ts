import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { visibleTextOf } from './helpers/visibleText';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_TEXT = readFileSync(resolve(__dirname, '../demo/meros.txt'), 'utf8').trim();

// root demo は supportedColumns: [2,4,6,8] + breakpoints + whenColumns で構成される。
// breakpoints は { 8: '120em', 6: '80em', 4: '60em', 2: '0' } (1em = 16px 基準で 1920/1280/960px)。
// viewport を明示固定して N を決定する: 1366px >= 1280px (80em) → N=6 が選ばれる。
test.describe('TilePage demo (走れメロス / supportedColumns + whenColumns @ N=6)', () => {
  test.use({ viewport: { width: 1366, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/');
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

  test('king / run / reunion variant は N=6 で表示される', async ({ page }) => {
    for (const id of ['king', 'run', 'reunion']) {
      const obstacle = page.locator(`.tilepage-obstacle[data-id="${id}"]`);
      await expect(obstacle).toBeVisible();
      const whenAttr = await obstacle.getAttribute('data-when-columns');
      expect(whenAttr).toBe('6');
    }
  });

  test('表示中 obstacle の grid 配置は whenColumns[6] の解決値と一致する', async ({ page }) => {
    // demo/main.ts の whenColumns[6] 宣言: king col=1 line=1 / run col=4 line=5 / reunion col=3 line=14
    // reunion の line=14 は viewport 高 800px の page 行数に収まらず line=10 に clamp される
    // (clamp は宣言が page に収まらない場合の仕様。 console.warn "variant clamped" が出る)。
    const expected: Record<string, { col: string; row: string }> = {
      king: { col: '1', row: '1' },
      run: { col: '4', row: '5' },
      reunion: { col: '3', row: '10' },
    };
    for (const [id, want] of Object.entries(expected)) {
      const style = await page.locator(`.tilepage-obstacle[data-id="${id}"]`).evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return { col: cs.gridColumnStart, row: cs.gridRowStart };
      });
      expect(style, `obstacle ${id}`).toEqual(want);
    }
  });

  test('circle / polygon obstacle に clip-path が同期される', async ({ page }) => {
    const run = page.locator('.tilepage-obstacle[data-id="run"]');
    const reunion = page.locator('.tilepage-obstacle[data-id="reunion"]');
    const runClip = await run.evaluate((el) => el.style.clipPath);
    const reunionClip = await reunion.evaluate((el) => el.style.clipPath);
    expect(runClip).toContain('polygon(');
    expect(reunionClip).toContain('polygon(');
  });

  test('main title は N=6 で viewport 内に表示され text が読める', async ({ page }) => {
    const title = page.locator('.tilepage-obstacle[data-id="main-title"]');
    await expect(title).toBeInViewport();
    await expect(title).toContainText('走れメロス');
  });

  test('flow text (obstacle 層除外) が source と厳密一致 (duplicate なし)', async ({ page }) => {
    const { text: V } = await visibleTextOf(page, {
      rootSelector: '.tilepage-book',
      excludeSelectors: ['.tilepage-obstacle', '.tilepage-obstacle-float'],
    });
    expect(V).toBe(SOURCE_TEXT);
    expect(V.length).toBe(SOURCE_TEXT.length);
  });
});
