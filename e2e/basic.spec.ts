import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { visibleTextOf } from './helpers/visibleText';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_TEXT = readFileSync(resolve(__dirname, '../demo/meros.txt'), 'utf8').trim();

test.describe('TilePage demo (走れメロス)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.tilepage-book');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('book と 3 形状の obstacle page が表示される', async ({ page }) => {
    await expect(page.locator('.tilepage-book')).toBeVisible();
    const pageCount = await page.locator('.tilepage-page').count();
    expect(pageCount).toBeGreaterThanOrEqual(3);
  });

  test('column 総数は page 数 × 1 page あたり column 数 に一致する', async ({ page }) => {
    // width モードでは N が viewport で変わるため、 1 page 目の column 数を読み取り
    // 全 page でその N が揃っていることを確認する。
    const pageCount = await page.locator('.tilepage-page').count();
    expect(pageCount).toBeGreaterThanOrEqual(1);
    const firstPageColumns = await page
      .locator('.tilepage-page')
      .first()
      .locator('.tilepage-column')
      .count();
    expect(firstPageColumns).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.tilepage-column')).toHaveCount(pageCount * firstPageColumns);
  });

  test('3 つの obstacle (rect / circle / polygon) が配置されている', async ({ page }) => {
    await expect(page.locator('.tilepage-obstacle')).toHaveCount(3);
  });

  test('矩形と交差する段に float が注入されている', async ({ page }) => {
    const count = await page.locator('.tilepage-obstacle-float').count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('circle / polygon の obstacle に clip-path が同期される', async ({ page }) => {
    const obstacles = page.locator('.tilepage-obstacle');
    await expect(obstacles).toHaveCount(3);
    const first = await obstacles.nth(0).evaluate((el) => el.style.clipPath);
    expect(first).toBe('');
    const second = await obstacles.nth(1).evaluate((el) => el.style.clipPath);
    const third = await obstacles.nth(2).evaluate((el) => el.style.clipPath);
    expect(second).toContain('polygon(');
    expect(third).toContain('polygon(');
  });

  test('book 全体の visible text が source と厳密一致 (duplicate なし)', async ({ page }) => {
    const { text: V } = await visibleTextOf(page, { rootSelector: '.tilepage-book' });
    expect(V).toBe(SOURCE_TEXT);
    expect(V.length).toBe(SOURCE_TEXT.length);
  });
});
