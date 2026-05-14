export type WritingMode = 'horizontal-tb' | 'vertical-rl';

export interface AxisInterval {
  start: number;
  end: number;
  size: number;
}

export interface AxisProjection {
  readonly writingMode: WritingMode;
  inlineAxisOf(rect: DOMRect): AxisInterval;
  blockAxisOf(rect: DOMRect): AxisInterval;
  inlineSizeOf(el: Element): number;
  blockSizeOf(el: Element): number;
  readingOrder<T>(windows: ReadonlyArray<T>): ReadonlyArray<T>;
  // float を window の block-start 物理辺に寄せるための CSS 物理側。
  // - horizontal-tb: block-start = 物理 top → float: 'left' (top に float できないので left + 高さで代用)
  // - vertical-rl:   block-start = 物理 right → float: 'right'
  floatSide(): 'left' | 'right';
}

function horizontalProjection(): AxisProjection {
  return {
    writingMode: 'horizontal-tb',
    inlineAxisOf(rect) {
      return { start: rect.left, end: rect.right, size: rect.width };
    },
    blockAxisOf(rect) {
      return { start: rect.top, end: rect.bottom, size: rect.height };
    },
    inlineSizeOf(el) {
      return (el as HTMLElement).clientWidth;
    },
    blockSizeOf(el) {
      return (el as HTMLElement).clientHeight;
    },
    readingOrder(windows) {
      return windows;
    },
    floatSide() {
      return 'left';
    },
  };
}

function verticalRlProjection(): AxisProjection {
  return {
    writingMode: 'vertical-rl',
    inlineAxisOf(rect) {
      return { start: rect.top, end: rect.bottom, size: rect.height };
    },
    // 右→左へ進む軸。start > end になりうるが size は |end - start|。
    blockAxisOf(rect) {
      return { start: rect.right, end: rect.left, size: rect.width };
    },
    inlineSizeOf(el) {
      return (el as HTMLElement).clientHeight;
    },
    blockSizeOf(el) {
      return (el as HTMLElement).clientWidth;
    },
    readingOrder(windows) {
      return windows;
    },
    floatSide() {
      return 'right';
    },
  };
}

export function axisProjection(mode: WritingMode): AxisProjection {
  if (mode === 'vertical-rl') return verticalRlProjection();
  return horizontalProjection();
}
