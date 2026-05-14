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
  };
}

export function axisProjection(mode: WritingMode): AxisProjection {
  if (mode === 'vertical-rl') return verticalRlProjection();
  return horizontalProjection();
}
