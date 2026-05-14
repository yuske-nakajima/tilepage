declare const __VERSION__: string;

export const VERSION: string = __VERSION__;
export {
  addFlow,
  addObstacle,
  addPage,
  type Book,
  type BookOptions,
  type ColumnsConfig,
  createBook,
  destroyBook,
  type FlowOptions,
  type GridPos,
  type Obstacle,
  type ObstacleOptions,
  type Page,
  type PageOptions,
  type WritingMode,
} from './TilePage';
export type { ObstacleShape, Point } from './utils/polygon';
