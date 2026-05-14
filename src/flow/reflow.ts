// book ルートに ResizeObserver を attach し、viewport / book / page のサイズ変化で
// stream 全体を再分配する。状態遷移は idle → pending (1 raf debounce) → reflowing →
// draining (reflow 中に積まれた notify があれば追 1 回) → idle。
// reflow 中の自己発火は isReflowing フラグで吸収して無限ループを防ぐ。

export interface ReflowController {
  // ResizeObserver / 外部からの reflow 要求。idle なら 1 raf 後に走り、
  // reflowing 中なら draining フラグだけ立てて追加 reflow を予約する。
  request(): void;
  // 完全停止と Observer の disconnect。
  destroy(): void;
  // テスト用: 現在の状態。'idle' | 'pending' | 'reflowing' | 'draining'。
  state(): ReflowState;
  // テスト用: 同期的に reflow を完了させる (debounce を待たずに今すぐ)。
  flushNow(): void;
}

export type ReflowState = 'idle' | 'pending' | 'reflowing' | 'draining';

export interface ReflowOptions {
  root: HTMLElement;
  observePages: () => ReadonlyArray<HTMLElement>;
  run: () => void;
}

export function createReflowController(options: ReflowOptions): ReflowController {
  const { root, observePages, run } = options;
  let isReflowing = false;
  let frameHandle: number | null = null;
  let pendingExtra = false;
  let destroyed = false;
  let currentState: ReflowState = 'idle';

  const win = root.ownerDocument.defaultView ?? window;
  const raf = win.requestAnimationFrame.bind(win);
  const caf = win.cancelAnimationFrame.bind(win);

  const observer = new (win as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver(
    () => {
      if (destroyed) return;
      if (isReflowing) {
        // reflow 中の通知は無視。完了後に 1 回だけまとめて追 reflow する。
        pendingExtra = true;
        return;
      }
      request();
    },
  );

  function attachObservers(): void {
    observer.disconnect();
    observer.observe(root);
    for (const p of observePages()) observer.observe(p);
  }

  function request(): void {
    if (destroyed) return;
    if (currentState === 'reflowing') {
      pendingExtra = true;
      return;
    }
    if (frameHandle !== null) return;
    currentState = 'pending';
    frameHandle = raf(() => {
      frameHandle = null;
      executeReflow();
    });
  }

  function executeReflow(): void {
    if (destroyed) return;
    // run() が throw しても state machine が 'reflowing' で stuck しないよう、
    // 終了処理 (state 戻し / observer 再 attach / pendingExtra ドレイン) を
    // 必ず finally で実行する。エラーは finally 後に再 throw して呼び出し元に surface する。
    let firstError: unknown;
    currentState = 'reflowing';
    isReflowing = true;
    try {
      run();
    } catch (e) {
      firstError = e;
    } finally {
      isReflowing = false;
    }
    try {
      attachObservers();
    } catch (e) {
      if (firstError === undefined) firstError = e;
    }
    if (pendingExtra && !destroyed) {
      pendingExtra = false;
      currentState = 'draining';
      currentState = 'reflowing';
      isReflowing = true;
      try {
        run();
      } catch (e) {
        if (firstError === undefined) firstError = e;
      } finally {
        isReflowing = false;
      }
      try {
        attachObservers();
      } catch (e) {
        if (firstError === undefined) firstError = e;
      }
    }
    currentState = 'idle';
    if (firstError !== undefined) throw firstError;
  }

  function flushNow(): void {
    if (destroyed) return;
    if (frameHandle !== null) {
      caf(frameHandle);
      frameHandle = null;
    }
    executeReflow();
  }

  attachObservers();

  return {
    request,
    destroy(): void {
      destroyed = true;
      if (frameHandle !== null) {
        caf(frameHandle);
        frameHandle = null;
      }
      observer.disconnect();
      currentState = 'idle';
    },
    state(): ReflowState {
      return currentState;
    },
    flushNow,
  };
}
