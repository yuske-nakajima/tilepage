import { expect, test } from '@playwright/test';

async function waitForReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      }),
  );
}

test.describe('addBoxHorizontal (newspaper-horizontal showcase)', () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/newspaper-horizontal/');
    await page.waitForSelector('.tilepage-book');
    await waitForReady(page);
  });

  test('.tilepage-box が DOM 上に存在し、 element 渡しの内容が保持される', async ({ page }) => {
    const box = page.locator('.tilepage-box[data-id="box-note"]');
    await expect(box).toHaveCount(1);
    // element 引数で渡した innerHTML がそのまま保持されていること (<strong> が残る)
    const strong = box.locator('strong');
    await expect(strong).toHaveCount(1);
    await expect(strong).toHaveText('注:');
  });

  test('border / padding の computed style が指定値に一致する', async ({ page }) => {
    const box = page.locator('.tilepage-box[data-id="box-note"]');
    await expect(box).toBeVisible();

    const styles = await box.evaluate((el: HTMLElement) => {
      const cs = getComputedStyle(el);
      return {
        borderTopWidth: cs.borderTopWidth,
        borderTopStyle: cs.borderTopStyle,
        // padding は em → px に解決される。 1em は font-size 依存なので非ゼロであることだけ確認する。
        paddingTop: cs.paddingTop,
        paddingLeft: cs.paddingLeft,
      };
    });

    expect(styles.borderTopWidth).toBe('2px');
    expect(styles.borderTopStyle).toBe('solid');
    // padding 1em は font-size に応じた非ゼロ px 値に解決される
    expect(Number.parseFloat(styles.paddingTop)).toBeGreaterThan(0);
    expect(Number.parseFloat(styles.paddingLeft)).toBeGreaterThan(0);
  });
});
