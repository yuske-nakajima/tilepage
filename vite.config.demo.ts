import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));

export default defineConfig({
	define: { __VERSION__: JSON.stringify(pkg.version) },
	root: resolve(import.meta.dirname, 'demo'),
	base: '/',
	build: {
		outDir: resolve(import.meta.dirname, 'demo-dist'),
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: resolve(import.meta.dirname, 'demo/index.html'),
			},
		},
	},
});
