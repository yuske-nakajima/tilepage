import type { AxisProjection } from './axis';
import { fitTextIntoWindow } from './measure';

export interface FlowWindow {
  element: HTMLElement;
}

export interface FlowHost {
  // 現在ある page 列を読み順で返す。
  windowsForPage(pageIndex: number): ReadonlyArray<FlowWindow>;
  // 必要なら page を生成。既に存在すればそれを返す。
  ensurePage(pageIndex: number): void;
  // pageIndex 以降の page を削除。
  trimPagesAfter(pageIndex: number): void;
  pageCount(): number;
}

// graphemes 全体を、host の page → window 列に順に流し込む。
// 余りが出れば ensurePage で次 page を作る。最後に余剰 page を trim する。
// 同じ chunk を複数 window に書き込まない (duplicate しない)。
export function distribute(
  host: FlowHost,
  graphemes: ReadonlyArray<string>,
  projection: AxisProjection,
): void {
  // 既存の窓を全部空にしてから流す
  for (let p = 0; p < host.pageCount(); p++) {
    for (const w of host.windowsForPage(p)) {
      clearTextHolder(w.element);
    }
  }

  let offset = 0;
  let pageIndex = 0;
  // 安全ガード: 過剰ループ防止。1 page あたり最大 graphemes.length の進捗を要求。
  const maxPages = Math.max(graphemes.length, 1) + 8;
  while (offset < graphemes.length && pageIndex < maxPages) {
    host.ensurePage(pageIndex);
    const windows = host.windowsForPage(pageIndex);
    let consumedInPage = false;
    for (const win of windows) {
      if (offset >= graphemes.length) break;
      const next = fitTextIntoWindow(win.element, graphemes, offset, projection);
      if (next > offset) consumedInPage = true;
      offset = next;
    }
    if (!consumedInPage) {
      // window が無い / 全 window で 0 字しか入らなかった: 進めないので脱出
      break;
    }
    pageIndex++;
  }

  // 余剰 page を刈る
  host.trimPagesAfter(pageIndex);
}

function clearTextHolder(win: HTMLElement): void {
  const holder = win.querySelector<HTMLElement>(':scope > .tilepage-flow-text');
  if (holder) holder.textContent = '';
}
