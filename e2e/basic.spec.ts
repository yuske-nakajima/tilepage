import { expect, test } from '@playwright/test';

test.describe('TilePage demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.tilepage-book');
  });

  test('横書き book と縦書き book が表示される', async ({ page }) => {
    await expect(page.locator('.tilepage-book')).toHaveCount(2);
    // 合計 5 page (横 3 + 縦 2)
    await expect(page.locator('.tilepage-page')).toHaveCount(5);
  });

  test('全 page に 6 個の column が存在する (合計 30)', async ({ page }) => {
    await expect(page.locator('.tilepage-column')).toHaveCount(30);
  });

  test('5 つの obstacle が配置されている', async ({ page }) => {
    await expect(page.locator('.tilepage-obstacle')).toHaveCount(5);
  });

  test('矩形と交差する段に float が注入されている', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const count = await page.locator('.tilepage-obstacle-float').count();
    // 5 obstacle 各々が複数段に跨るので、最低でも 5 個以上
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('circle / polygon の obstacle に clip-path が同期される', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const obstacles = page.locator('.tilepage-obstacle');
    // 横書き book の 1 つ目 (rect default) は clip-path 未設定
    const first = await obstacles.nth(0).evaluate((el) => el.style.clipPath);
    expect(first).toBe('');
    // 2 つ目 (circle) と 3 つ目 (polygon) は polygon() が設定される
    expect(await obstacles.nth(1).evaluate((el) => el.style.clipPath)).toContain('polygon(');
    expect(await obstacles.nth(2).evaluate((el) => el.style.clipPath)).toContain('polygon(');
  });

  test('縦書き book に writing-mode: vertical-rl が適用される', async ({ page }) => {
    const books = page.locator('.tilepage-book');
    const horizontalScroll = await books.nth(1).getAttribute('data-scroll');
    const writingMode = await books.nth(1).getAttribute('data-writing-mode');
    expect(writingMode).toBe('vertical-rl');
    expect(horizontalScroll).toBe('horizontal');

    // 縦書き page の column に computed style として vertical-rl が当たる
    const verticalColumn = page
      .locator('.tilepage-page[data-writing-mode="vertical-rl"] .tilepage-column')
      .first();
    const computed = await verticalColumn.evaluate((el) => getComputedStyle(el).writingMode);
    expect(computed).toBe('vertical-rl');
  });

  test('各段に本文テキストが流し込まれている', async ({ page }) => {
    const flowTexts = page.locator('.tilepage-flow-text');
    await expect(flowTexts).toHaveCount(30);
    const firstText = await flowTexts.first().textContent();
    expect(firstText?.length ?? 0).toBeGreaterThan(0);
  });
});
