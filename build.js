const { context, build } = require('esbuild');
const { polyfillNode } = require('esbuild-plugin-polyfill-node');
const { wasmLoader } = require('esbuild-plugin-wasm');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      if (result.errors.length) {
        result.errors.forEach((error) =>
          console.error(
            `> ${error.location.file}:${error.location.line}:${error.location.column}: error: ${error.text}`,
          ),
        );
      } else console.log('[watch] build finished');
    });
  },
};

/**
 * @type {import('esbuild').BuildOptions}
 */
const nativeConfig = {
  entryPoints: ['./src/extension-native.ts'],
  bundle: true,
  minify: true,
  platform: 'node', // For CJS
  outfile: './out/native/extension.js',
  target: 'node16',
  format: 'cjs',
  external: ['vscode'],
};

/**
 * @type {import('esbuild').BuildOptions}
 */
const webConfig = {
  entryPoints: ['./src/extension-web.ts'],
  bundle: true,
  minify: true,
  platform: 'browser', // For ESM
  outfile: './out/web/extension.js',
  target: 'es2020',
  format: 'cjs',
  external: ['vscode'],
  plugins: [
    polyfillNode({
      polyfills: {},
      globals: {
        // global: true,
      },
    }),
    wasmLoader(),
  ],
};

async function main() {
  try {
    // Watch mode
    if (process.argv.includes('--watch')) {
      // Native
      const nativeContext = await context({
        ...nativeConfig,
        sourcemap: true,
        minify: false,
        plugins: [esbuildProblemMatcherPlugin, ...(nativeConfig.plugins ?? [])],
      });

      // Web
      const webContext = await context({
        ...webConfig,
        sourcemap: true,
        minify: false,
        plugins: [esbuildProblemMatcherPlugin, ...(webConfig.plugins ?? [])],
      });

      await Promise.all([nativeContext.watch(), webContext.watch()]);
    } else {
      // Build mode
      await Promise.all([build(nativeConfig), build(webConfig)]);
    }
  } catch (error) {
    console.error(error);
  }
}

main();
