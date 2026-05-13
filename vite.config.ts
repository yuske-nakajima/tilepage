import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));

export default defineConfig(({ command }) => ({
	root: command === 'serve' ? resolve(import.meta.dirname, 'demo') : undefined,
	define: {
		__VERSION__: JSON.stringify(pkg.version),
	},
	build: {
		minify: 'terser',
		rollupOptions: {
			output: { exports: 'named' },
		},
		lib: {
			entry: resolve(import.meta.dirname, 'src/index.ts'),
			name: 'TilePage',
			formats: ['es', 'umd'],
			fileName: (format) => {
				if (format === 'es') return 'tilepage.js';
				if (format === 'umd') return 'tilepage.umd.cjs';
				return `tilepage.${format}.js`;
			},
		},
	},
}));
