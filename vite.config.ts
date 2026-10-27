import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { injectSwManifest } from './scripts/sw-manifest.ts';

/**
 * Stamps dist/sw.js with a content hash of the build and the list of hashed
 * JS/CSS bundles, so the service worker precaches exactly this deploy's files
 * and purges the previous deploy's cache on activate.
 */
function swPrecacheManifest(): Plugin {
  return {
    name: 'sw-precache-manifest',
    apply: 'build',
    writeBundle(options, bundle) {
      const outDir = options.dir ?? resolve(process.cwd(), 'dist');
      const hash = createHash('sha256');
      const assets: string[] = [];

      for (const fileName of Object.keys(bundle).sort()) {
        const output = bundle[fileName];
        hash.update(fileName);
        hash.update(output.type === 'chunk' ? output.code : output.source);
        if (/\.(js|css)$/.test(fileName)) {
          assets.push(`./${fileName}`);
        }
      }

      const swPath = resolve(outDir, 'sw.js');
      const source = readFileSync(swPath, 'utf-8');
      writeFileSync(
        swPath,
        injectSwManifest(source, { buildId: hash.digest('hex').slice(0, 12), assets })
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [swPrecacheManifest()],
  build: {
    target: 'es2022',
    minify: true,
    cssMinify: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'vmThreads',
    setupFiles: ['./tests/setup.ts'],
  },
});
