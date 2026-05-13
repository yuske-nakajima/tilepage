import { expect, test } from '@playwright/test';

test.describe('TilePage demo', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('.tilepage-book');
	});

	test('book と page が表示される', async ({ page }) => {
		await expect(page.locator('.tilepage-book')).toBeVisible();
		await expect(page.locator('.tilepage-page')).toBeVisible();
	});

	test('6 個の column が存在する', async ({ page }) => {
		const columns = page.locator('.tilepage-column');
		await expect(columns).toHaveCount(6);
	});

	test('obstacle が配置されている', async ({ page }) => {
		const obstacle = page.locator('.tilepage-obstacle');
		await expect(obstacle).toBeVisible();
	});

	test('矩形と交差する段に float が注入されている', async ({ page }) => {
		// ResizeObserver と画像 load を待つ
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(500);
		const floats = page.locator('.tilepage-obstacle-float');
		const count = await floats.count();
		expect(count).toBeGreaterThanOrEqual(1);
		expect(count).toBeLessThanOrEqual(6);
	});

	test('各段に本文テキストが流し込まれている', async ({ page }) => {
		const flowTexts = page.locator('.tilepage-flow-text');
		await expect(flowTexts).toHaveCount(6);
		const firstText = await flowTexts.first().textContent();
		expect(firstText?.length ?? 0).toBeGreaterThan(0);
	});
});
