// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReflowController } from '../reflow';

// ResizeObserver の jsdom shim。observe / disconnect を no-op で受ける。
class FakeResizeObserver {
  observe(_el: Element): void {}
  unobserve(_el: Element): void {}
  disconnect(): void {}
}

beforeEach(() => {
  document.body.innerHTML = '';
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
  // raf を同期実行に置き換える (debounce を待たず即時実行)。
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
    (cb: FrameRequestCallback): number => {
      cb(performance.now());
      return 0;
    },
  );
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((_id: number) => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reflow controller error recovery', () => {
  it('run() が throw しても state は idle に戻る', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const runFn = vi.fn().mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const ctrl = createReflowController({
      root,
      observePages: () => [],
      run: runFn,
    });

    expect(() => ctrl.request()).toThrow('boom');
    expect(ctrl.state()).toBe('idle');
    ctrl.destroy();
  });

  it('throw 後の次回 request() でも reflow が正常に走る', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const runFn = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('first failure');
      })
      .mockImplementationOnce(() => {
        // 成功する 2 回目。
      });

    const ctrl = createReflowController({
      root,
      observePages: () => [],
      run: runFn,
    });

    expect(() => ctrl.request()).toThrow('first failure');
    expect(ctrl.state()).toBe('idle');

    // 次回 request は state machine が idle に戻っているので普通に走る。
    expect(() => ctrl.request()).not.toThrow();
    expect(runFn).toHaveBeenCalledTimes(2);
    expect(ctrl.state()).toBe('idle');

    ctrl.destroy();
  });

  it('flushNow() でも throw 後に state が stuck しない', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const runFn = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('flushNow boom');
      })
      .mockImplementationOnce(() => undefined);

    const ctrl = createReflowController({
      root,
      observePages: () => [],
      run: runFn,
    });

    expect(() => ctrl.flushNow()).toThrow('flushNow boom');
    expect(ctrl.state()).toBe('idle');

    expect(() => ctrl.flushNow()).not.toThrow();
    expect(runFn).toHaveBeenCalledTimes(2);
    expect(ctrl.state()).toBe('idle');

    ctrl.destroy();
  });
});
