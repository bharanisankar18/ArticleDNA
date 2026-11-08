import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The content script is injected on demand with chrome.scripting.executeScript, which needs a
// single self-contained classic script, so it is bundled as an IIFE with no shared chunks.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome116',
    copyPublicDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'ArticleDNAContent',
      fileName: () => 'content.js',
    },
  },
});
