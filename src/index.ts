declare const __VERSION__: string;

export const VERSION: string = __VERSION__;
export {
  addBoxHorizontal,
  addFlow,
  addHeadlineHorizontal,
  addObstacleHorizontal,
  addObstacleVertical,
  addPage,
  addPullquoteHorizontal,
  type BaseObstacleOptions,
  type Book,
  type BookOptions,
  type BoxHorizontalOptions,
  type ColumnsConfig,
  createBook,
  destroyBook,
  type FlowOptions,
  type GridPos,
  type HeadlineHorizontalOptions,
  type HorizontalObstacleOptions,
  type HorizontalWhenColumnsVariant,
  type Obstacle,
  type Page,
  type PageOptions,
  type PullquoteHorizontalOptions,
  type VerticalObstacleOptions,
  type VerticalWhenColumnsVariant,
  type WritingMode,
} from './TilePage';
export type { ObstacleShape, Point } from './utils/polygon';
