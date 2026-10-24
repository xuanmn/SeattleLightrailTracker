/**
 * Build-time service worker manifest injection.
 *
 * `public/sw.js` ships with development placeholders:
 *   const BUILD_ID = 'dev';
 *   const BUILD_ASSETS = [];
 * The Vite build replaces them with a content hash of the build output and the
 * list of hashed JS/CSS files, so each deploy precaches exactly its own bundles
 * and the previous deploy's cache is purged on activate.
 *
 * Kept free of Node imports so it can be unit tested and type-checked with the app.
 */

const BUILD_ID_PLACEHOLDER = /const BUILD_ID = ['"]dev['"];/;
const BUILD_ASSETS_PLACEHOLDER = /const BUILD_ASSETS = \[\];/;

export interface SwManifest {
  buildId: string;
  assets: string[];
}

export function injectSwManifest(source: string, manifest: SwManifest): string {
  if (!BUILD_ID_PLACEHOLDER.test(source) || !BUILD_ASSETS_PLACEHOLDER.test(source)) {
    throw new Error(
      'sw.js is missing the BUILD_ID / BUILD_ASSETS placeholder; refusing to ship a service worker without a precache manifest.'
    );
  }
  if (!/^[\w-]+$/.test(manifest.buildId)) {
    throw new Error(`Invalid service worker build id: ${manifest.buildId}`);
  }

  return source
    .replace(BUILD_ID_PLACEHOLDER, () => `const BUILD_ID = '${manifest.buildId}';`)
    .replace(BUILD_ASSETS_PLACEHOLDER, () => `const BUILD_ASSETS = ${JSON.stringify(manifest.assets)};`);
}
