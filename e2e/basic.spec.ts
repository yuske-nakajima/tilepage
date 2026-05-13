import { expect, test } from '@playwright/test';

test.describe('TilePage demo', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('.tilepage-book');
	});

	test('book と 3 page が表示される', async ({ page }) => {
		await expect(page.locator('.tilepage-book')).toBeVisible();
		await expect(page.locator('.tilepage-page')).toHaveCount(3);
	});

	test('各 page に 6 個の column が存在する (合計 18)', async ({ page }) => {
		await expect(page.locator('.tilepage-column')).toHaveCount(18);
	});

	test('3 つの obstacle (rect / circle / polygon) が配置されている', async ({ page }) => {
		await expect(page.locator('.tilepage-obstacle')).toHaveCount(3);
	});

	test('矩形と交差する段に float が注入されている', async ({ page }) => {
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(500);
		const count = await page.locator('.tilepage-obstacle-float').count();
		// 3 obstacle 各々が複数段に跨るので、最低でも 3 個以上
		expect(count).toBeGreaterThanOrEqual(3);
	});

	test('circle / polygon の obstacle に clip-path が同期される', async ({ page }) => {
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(500);
		const obstacles = page.locator('.tilepage-obstacle');
		await expect(obstacles).toHaveCount(3);
		// 1 つ目 (rect default) は clip-path 未設定
		const first = await obstacles.nth(0).evaluate((el) => el.style.clipPath);
		expect(first).toBe('');
		// 2 つ目 (circle) と 3 つ目 (polygon) に polygon() が設定される
		const second = await obstacles.nth(1).evaluate((el) => el.style.clipPath);
		const third = await obstacles.nth(2).evaluate((el) => el.style.clipPath);
		expect(second).toContain('polygon(');
		expect(third).toContain('polygon(');
	});

	test('各段に本文テキストが流し込まれている', async ({ page }) => {
		const flowTexts = page.locator('.tilepage-flow-text');
		await expect(flowTexts).toHaveCount(18);
		const firstText = await flowTexts.first().textContent();
		expect(firstText?.length ?? 0).toBeGreaterThan(0);
	});
});
