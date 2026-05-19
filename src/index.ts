declare const __VERSION__: string;

export const VERSION: string = __VERSION__;
export {
  addFlow,
  addObstacleHorizontal,
  addObstacleVertical,
  addPage,
  type BaseObstacleOptions,
  type Book,
  type BookOptions,
  type ColumnsConfig,
  createBook,
  destroyBook,
  type FlowOptions,
  type GridPos,
  type HorizontalObstacleOptions,
  type HorizontalWhenColumnsVariant,
  type Obstacle,
  type Page,
  type PageOptions,
  type VerticalObstacleOptions,
  type VerticalWhenColumnsVariant,
  type WritingMode,
} from './TilePage';
export type { ObstacleShape, Point } from './utils/polygon';
