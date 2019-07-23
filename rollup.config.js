import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';

const { dependencies } = require('./package.json');

/** @type {import('rollup').RollupOptions} */
const nodeConfig = {
  input: ['src/cli/bin.ts', 'src/cli/index.ts'],
  output: {
    dir: 'build',
    format: 'cjs',
    sourcemap: true,
    banner: '#!/usr/bin/env node',
  },
  external: [...Object.keys(dependencies), 'path', 'util', 'fs', 'url'],
  plugins: [typescript({ tsconfig: 'src/cli/tsconfig.json' }), resolve()],
};

const uiTypeScriptPluginOptions = { tsconfig: 'src/ui/tsconfig.json' };

/** @type {import('rollup').RollupOptions} */
const sharedUiScriptConfig = {
  input: 'src/ui/shared.ts',
  output: {
    file: 'docs/build/shared.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [typescript(uiTypeScriptPluginOptions)],
};

/** @type {import('rollup').RollupOptions} */
const uiConfig = {
  input: 'src/ui/tree-ui.ts',
  output: {
    dir: 'docs/build',
    chunkFileNames: '[name].js',
    format: 'esm',
    sourcemap: true,
  },
  external: ['node-fetch', 'url'],
  plugins: [typescript(uiTypeScriptPluginOptions), resolve(), commonjs()],
};

/** @type {import('rollup').RollupOptions} */
const uiWorkerConfig = {
  input: 'src/ui/tree-worker.ts',
  output: {
    file: 'docs/build/tree-worker.js',
    format: 'esm',
    sourcemap: true,
  },
  external: ['node-fetch', 'url'],
  plugins: [typescript(uiTypeScriptPluginOptions), resolve(), commonjs()],
};

export default [nodeConfig, sharedUiScriptConfig, uiConfig, uiWorkerConfig];
