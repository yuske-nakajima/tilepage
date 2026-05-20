import { expect, test } from '@playwright/test';

// addFlow paragraph オプションが .tilepage-flow-text に CSS パススルーで反映されることを
// Chromium の computed style で検証する。
//
// 検証軸:
//   - indent: text-indent が指定値と一致 (px 解決後)
//   - justify: text-align: justify
//   - kinsoku: line-break + word-break の組み合わせ
//   - hangingPunctuation: hanging-punctuation: allow-end
//   - paragraph 未指定 baseline: text-align !== 'justify' / data 属性無し
//
// flaky 対策: fonts.ready + networkidle + 2 frame rAF を待つ。

async function waitForReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      }),
  );
  await page.waitForSelector('#app[data-ready="true"]');
  await page.waitForSelector('.tilepage-flow-text');
}

test.describe('addFlow paragraph option → computed style', () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test('paragraph 未指定で data-paragraph-* 属性が一切付かない', async ({ page }) => {
    await page.goto('/e2e/fixtures/paragraph/');
    await waitForReady(page);

    const holder = page.locator('.tilepage-flow-text').first();
    await expect(holder).toBeVisible();

    const attrs = await holder.evaluate((el: HTMLElement) => ({
      indent: el.hasAttribute('data-paragraph-indent'),
      justify: el.hasAttribute('data-paragraph-justify'),
      kinsoku: el.hasAttribute('data-paragraph-kinsoku'),
      hanging: el.hasAttribute('data-paragraph-hanging-punctuation'),
      textAlign: getComputedStyle(el).textAlign,
    }));
    expect(attrs.indent).toBe(false);
    expect(attrs.justify).toBe(false);
    expect(attrs.kinsoku).toBe(false);
    expect(attrs.hanging).toBe(false);
    // CSS 既定の text-align は justify ではない。
    expect(attrs.textAlign).not.toBe('justify');
  });

  test('indent: 2em で text-indent が 2em 相当の px 値になる', async ({ page }) => {
    await page.goto('/e2e/fixtures/paragraph/?indent=2em');
    await waitForReady(page);

    const holder = page.locator('.tilepage-flow-text').first();
    const result = await holder.evaluate((el: HTMLElement) => {
      const cs = getComputedStyle(el);
      const fs = Number.parseFloat(cs.fontSize);
      // text-indent は computed style では px に解決される。
      const indentPx = Number.parseFloat(cs.textIndent);
      return {
        indentPx,
        fs,
        dataAttr: el.getAttribute('data-paragraph-indent'),
      };
    });
    expect(result.dataAttr).toBe('2em');
    expect(result.fs).toBeGreaterThan(0);
    // 2em ≒ font-size * 2。 subpixel 丸めの揺れを考慮し +-1px の許容。
    expect(result.indentPx).toBeGreaterThan(result.fs * 2 - 1);
    expect(result.indentPx).toBeLessThan(result.fs * 2 + 1);
  });

  test('justify: true で text-align: justify が反映される', async ({ page }) => {
    await page.goto('/e2e/fixtures/paragraph/?justify=true');
    await waitForReady(page);
    const holder = page.locator('.tilepage-flow-text').first();
    const result = await holder.evaluate((el: HTMLElement) => ({
      textAlign: getComputedStyle(el).textAlign,
      dataAttr: el.getAttribute('data-paragraph-justify'),
    }));
    expect(result.dataAttr).toBe('true');
    expect(result.textAlign).toBe('justify');
  });

  test('kinsoku: strict で line-break: strict / word-break: keep-all が反映される', async ({
    page,
  }) => {
    await page.goto('/e2e/fixtures/paragraph/?kinsoku=strict');
    await waitForReady(page);
    const holder = page.locator('.tilepage-flow-text').first();
    const result = await holder.evaluate((el: HTMLElement) => {
      const cs = getComputedStyle(el);
      return {
        lineBreak: cs.lineBreak,
        wordBreak: cs.wordBreak,
        dataAttr: el.getAttribute('data-paragraph-kinsoku'),
      };
    });
    expect(result.dataAttr).toBe('strict');
    expect(result.lineBreak).toBe('strict');
    expect(result.wordBreak).toBe('keep-all');
  });

  test('kinsoku: none で line-break: anywhere / word-break: break-all が反映される', async ({
    page,
  }) => {
    await page.goto('/e2e/fixtures/paragraph/?kinsoku=none');
    await waitForReady(page);
    const holder = page.locator('.tilepage-flow-text').first();
    const result = await holder.evaluate((el: HTMLElement) => {
      const cs = getComputedStyle(el);
      return {
        lineBreak: cs.lineBreak,
        wordBreak: cs.wordBreak,
        dataAttr: el.getAttribute('data-paragraph-kinsoku'),
      };
    });
    expect(result.dataAttr).toBe('none');
    expect(result.lineBreak).toBe('anywhere');
    expect(result.wordBreak).toBe('break-all');
  });

  test('hangingPunctuation: true で data 属性が付き、 injected CSS が allow-end を含む', async ({
    page,
  }) => {
    await page.goto('/e2e/fixtures/paragraph/?hanging=true');
    await waitForReady(page);
    const holder = page.locator('.tilepage-flow-text').first();

    // hanging-punctuation は Chromium で未実装 (2026-05 時点 / MDN: limited availability)。
    // getComputedStyle では取得できないため、 DOM 側 data 属性 + injected stylesheet 内に
    // セレクタとプロパティが含まれていることで「CSS パススルーが ready」 を verify する。
    const dataAttr = await holder.getAttribute('data-paragraph-hanging-punctuation');
    expect(dataAttr).toBe('true');

    // injected style 要素の textContent を直接読む。 Chromium は CSS parse 時に未対応プロパティを
    // CSSOM (cssRules) から drop するが、 <style> 要素の textContent は元 source 文字列を保持する。
    const cssIncludesRule = await page.evaluate(() => {
      const style = document.head.querySelector<HTMLStyleElement>('style[data-tilepage="styles"]');
      const text = style?.textContent ?? '';
      return text.includes('data-paragraph-hanging-punctuation') && text.includes('allow-end');
    });
    expect(cssIncludesRule).toBe(true);
  });

  test('全オプション同時指定で 4 種類すべての CSS が反映される', async ({ page }) => {
    await page.goto('/e2e/fixtures/paragraph/?indent=1em&justify=true&kinsoku=strict&hanging=true');
    await waitForReady(page);
    const holder = page.locator('.tilepage-flow-text').first();
    const result = await holder.evaluate((el: HTMLElement) => {
      const cs = getComputedStyle(el);
      const fs = Number.parseFloat(cs.fontSize);
      return {
        indentPx: Number.parseFloat(cs.textIndent),
        fontSize: fs,
        textAlign: cs.textAlign,
        lineBreak: cs.lineBreak,
        wordBreak: cs.wordBreak,
        hangingAttr: el.getAttribute('data-paragraph-hanging-punctuation'),
      };
    });
    expect(result.indentPx).toBeGreaterThan(result.fontSize - 1);
    expect(result.indentPx).toBeLessThan(result.fontSize + 1);
    expect(result.textAlign).toBe('justify');
    expect(result.lineBreak).toBe('strict');
    expect(result.wordBreak).toBe('keep-all');
    // hangingPunctuation の computed style assert は Chromium 未対応のため DOM attribute で確認する。
    expect(result.hangingAttr).toBe('true');
  });
});
