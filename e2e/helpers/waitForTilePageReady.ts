import type { Page } from '@playwright/test';

const STABLE_FRAME_COUNT = 3;
const MAX_FRAME_COUNT = 300;

export async function waitForTilePageReady(page: Page): Promise<void> {
  await page.locator('.tilepage-book').waitFor({ state: 'visible' });

  await page.evaluate(
    async ({ maxFrameCount, stableFrameCount }) => {
      await document.fonts.ready;

      const images = Array.from(document.images);
      await Promise.all(
        images.map(
          (image) =>
            new Promise<void>((resolve) => {
              if (image.complete) {
                resolve();
                return;
              }
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            }),
        ),
      );

      const layoutSnapshot = (): string => {
        const root = document.querySelector<HTMLElement>('.tilepage-book');
        if (!root) return '';

        const elements = Array.from(
          root.querySelectorAll<HTMLElement>(
            '.tilepage-page, .tilepage-column, .tilepage-obstacle, .tilepage-obstacle-float, .tilepage-flow-text',
          ),
        );

        return JSON.stringify([
          root.dataset.activeColumns,
          root.scrollWidth,
          root.scrollHeight,
          ...elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return [
              element.className,
              element.dataset.id,
              rect.x,
              rect.y,
              rect.width,
              rect.height,
              element.childElementCount,
              element.textContent?.length ?? 0,
            ];
          }),
        ]);
      };

      await new Promise<void>((resolve, reject) => {
        let frameCount = 0;
        let matchingFrameCount = 0;
        let previousSnapshot = '';

        const observeFrame = (): void => {
          const snapshot = layoutSnapshot();
          matchingFrameCount = snapshot === previousSnapshot ? matchingFrameCount + 1 : 0;
          previousSnapshot = snapshot;
          frameCount += 1;

          if (matchingFrameCount >= stableFrameCount) {
            resolve();
            return;
          }
          if (frameCount >= maxFrameCount) {
            reject(new Error('TilePage layout did not stabilize'));
            return;
          }
          requestAnimationFrame(observeFrame);
        };

        requestAnimationFrame(observeFrame);
      });
    },
    { maxFrameCount: MAX_FRAME_COUNT, stableFrameCount: STABLE_FRAME_COUNT },
  );
}
