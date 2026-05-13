import { injectStyles } from './styles/inject';
import { intersect, type Rect } from './utils/intersect';

export interface BookOptions {
	container?: HTMLElement;
	columns?: number;
	gutter?: string;
	padding?: string;
}

export interface Book {
	root: HTMLElement;
	columns: number;
	pages: Page[];
}

export interface PageOptions {
	id?: string;
}

export interface Page {
	element: HTMLElement;
	obstacleLayer: HTMLElement;
	flowLayer: HTMLElement;
	columnElements: HTMLElement[];
	obstacles: Obstacle[];
	book: Book;
	observer: ResizeObserver;
}

export interface GridPos {
	col: string;
	row: string;
}

export interface ObstacleOptions {
	at: GridPos;
	element?: HTMLElement;
	src?: string;
	alt?: string;
	shapeMargin?: string;
}

export interface Obstacle {
	element: HTMLElement;
	colRange: [number, number];
	rowRange: [number, number];
	floats: HTMLElement[];
	shapeMargin: string;
}

export interface FlowOptions {
	text?: string;
	html?: string;
}

function parseGridRange(s: string): [number, number] {
	const m = s.match(/^(\d+)(?:-(\d+))?$/);
	if (!m) throw new Error(`invalid grid range: ${s}`);
	const start = Number.parseInt(m[1], 10);
	const end = m[2] ? Number.parseInt(m[2], 10) + 1 : start + 1;
	return [start, end];
}

export function createBook(options: BookOptions = {}): Book {
	injectStyles();
	const root = document.createElement('div');
	root.className = 'tilepage-book';
	const columns = options.columns ?? 6;
	root.style.setProperty('--tilepage-columns', String(columns));
	if (options.gutter) root.style.setProperty('--tilepage-gutter', options.gutter);
	if (options.padding) root.style.setProperty('--tilepage-padding', options.padding);
	if (options.container) options.container.appendChild(root);
	return { root, columns, pages: [] };
}

export function addPage(book: Book, options: PageOptions = {}): Page {
	const page = document.createElement('div');
	page.className = 'tilepage-page';
	if (options.id) page.id = options.id;

	const obstacleLayer = document.createElement('div');
	obstacleLayer.className = 'tilepage-obstacle-layer';

	const flowLayer = document.createElement('div');
	flowLayer.className = 'tilepage-flow-layer';

	const columnElements: HTMLElement[] = [];
	for (let i = 0; i < book.columns; i++) {
		const col = document.createElement('div');
		col.className = 'tilepage-column';
		col.dataset.column = String(i + 1);
		flowLayer.appendChild(col);
		columnElements.push(col);
	}

	page.appendChild(flowLayer);
	page.appendChild(obstacleLayer);
	book.root.appendChild(page);

	const pageObj: Page = {
		element: page,
		obstacleLayer,
		flowLayer,
		columnElements,
		obstacles: [],
		book,
		observer: undefined as unknown as ResizeObserver,
	};

	const observer = new ResizeObserver(() => {
		reflowObstacles(pageObj);
	});
	observer.observe(page);
	pageObj.observer = observer;

	book.pages.push(pageObj);
	return pageObj;
}

export function addObstacle(page: Page, options: ObstacleOptions): Obstacle {
	let el: HTMLElement;
	if (options.element) {
		el = options.element;
	} else if (options.src) {
		const img = document.createElement('img');
		img.src = options.src;
		if (options.alt) img.alt = options.alt;
		el = img;
	} else {
		el = document.createElement('div');
	}
	el.classList.add('tilepage-obstacle');
	const colRange = parseGridRange(options.at.col);
	const rowRange = parseGridRange(options.at.row);
	el.style.gridColumn = `${colRange[0]} / ${colRange[1]}`;
	el.style.gridRow = `${rowRange[0]} / ${rowRange[1]}`;
	page.obstacleLayer.appendChild(el);

	const obstacle: Obstacle = {
		element: el,
		colRange,
		rowRange,
		floats: [],
		shapeMargin: options.shapeMargin ?? '0',
	};
	page.obstacles.push(obstacle);

	if (el.tagName === 'IMG' && !(el as HTMLImageElement).complete) {
		el.addEventListener('load', () => reflowObstacles(page), { once: true });
	}
	reflowObstacles(page);
	return obstacle;
}

export function addFlow(page: Page, options: FlowOptions = {}): void {
	const text = options.text ?? '';
	const html = options.html;
	for (const col of page.columnElements) {
		// 既存の float は保持し、テキスト部分のみ差し替える
		const flowText = col.querySelector('.tilepage-flow-text');
		const target = flowText ?? document.createElement('div');
		target.className = 'tilepage-flow-text';
		if (html !== undefined) {
			target.innerHTML = html;
		} else {
			target.textContent = text;
		}
		if (!flowText) col.appendChild(target);
	}
	reflowObstacles(page);
}

function reflowObstacles(page: Page): void {
	for (const obstacle of page.obstacles) {
		for (const f of obstacle.floats) f.remove();
		obstacle.floats.length = 0;
	}

	const pageRect = page.element.getBoundingClientRect();
	if (pageRect.width === 0 || pageRect.height === 0) return;

	for (const obstacle of page.obstacles) {
		const obRect = obstacle.element.getBoundingClientRect();
		const obstacleBox: Rect = {
			x: obRect.left - pageRect.left,
			y: obRect.top - pageRect.top,
			width: obRect.width,
			height: obRect.height,
		};

		for (const col of page.columnElements) {
			const colRect = col.getBoundingClientRect();
			const columnBox: Rect = {
				x: colRect.left - pageRect.left,
				y: colRect.top - pageRect.top,
				width: colRect.width,
				height: colRect.height,
			};
			const overlap = intersect(obstacleBox, columnBox);
			if (!overlap) continue;

			const localTop = overlap.y - columnBox.y;
			const localBottom = localTop + overlap.height;
			const localLeft = overlap.x - columnBox.x;
			const localRight = localLeft + overlap.width;

			const float = document.createElement('div');
			float.className = 'tilepage-obstacle-float';
			float.style.float = 'left';
			float.style.width = `${columnBox.width}px`;
			float.style.height = `${localBottom}px`;
			float.style.shapeOutside = `polygon(${localLeft}px ${localTop}px, ${localRight}px ${localTop}px, ${localRight}px ${localBottom}px, ${localLeft}px ${localBottom}px)`;
			float.style.shapeMargin = obstacle.shapeMargin;

			col.insertBefore(float, col.firstChild);
			obstacle.floats.push(float);
		}
	}
}

export function destroyBook(book: Book): void {
	for (const page of book.pages) {
		page.observer.disconnect();
	}
	book.root.remove();
}
