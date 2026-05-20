import { expect, test } from '@playwright/test';

// 共通の flaky 対策: fonts.ready + networkidle を待ち、 ResizeObserver の発火後 2 frame
// 相当の rAF を回してから assert する。
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

test.describe('addPullquoteHorizontal (newspaper-horizontal showcase)', () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/demo/newspaper-horizontal/');
    await page.waitForSelector('.tilepage-book');
    await waitForReady(page);
  });

  test('<blockquote> が DOM 上に存在する', async ({ page }) => {
    const pq = page.locator('blockquote.tilepage-pullquote[data-id="pullquote-main"]');
    await expect(pq).toHaveCount(1);
  });

  test('<cite> 子要素が生成され、 引用元が描画される', async ({ page }) => {
    const cite = page.locator('blockquote.tilepage-pullquote[data-id="pullquote-main"] cite');
    await expect(cite).toHaveCount(1);
    await expect(cite).toHaveText('メロス');
  });

  test('引用符が CSS ::before / ::after から付与される (text content には含まれない)', async ({
    page,
  }) => {
    const pq = page.locator('blockquote.tilepage-pullquote[data-id="pullquote-main"]');
    // text node に引用符が混ざっていないこと。 textContent には ::before / ::after の生成内容は含まれない。
    const textOnly = await pq.evaluate(
      (el: HTMLElement) => el.querySelector('.tilepage-pullquote-text')?.textContent ?? '',
    );
    expect(textOnly).not.toMatch(/[「」『』"”“]/);

    // ::before / ::after が引用符を生成していること
    const beforeContent = await pq.evaluate(
      (el: HTMLElement) => getComputedStyle(el, '::before').content,
    );
    const afterContent = await pq.evaluate(
      (el: HTMLElement) => getComputedStyle(el, '::after').content,
    );
    // open-quote / close-quote は computed では実際の文字列に解決される
    expect(beforeContent).toMatch(/[「『"“]|open-quote/);
    expect(afterContent).toMatch(/[」』"”]|close-quote/);
  });
});
