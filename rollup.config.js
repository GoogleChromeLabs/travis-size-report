// @ts-check
import resolve from 'rollup-plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';

const { dependencies } = require('./package.json');

/** @type {import('rollup').RollupOptions} */
const nodeConfig = {
  input: ['src/bin.ts', 'src/index.ts'],
  output: {
    dir: 'build',
    format: 'cjs',
    sourcemap: true,
    banner: '#!/usr/bin/env node',
  },
  external: [...Object.keys(dependencies), 'path', 'util', 'fs', 'url'],
  plugins: [typescript(), resolve()],
};

/** @type {import('rollup').RollupOptions} */
const uiConfig = {
  input: 'src/ui/tree-ui.ts',
  output: {
    dir: 'build/ui',
    format: 'esm',
    sourcemap: true,
  },
  external: ['node-fetch', 'url'],
  plugins: [typescript(), resolve()],
};

/** @type {import('rollup').RollupOptions} */
const uiWorkerConfig = {
  input: 'src/ui/tree-worker.ts',
  output: {
    file: 'build/ui/tree-worker.js',
    format: 'esm',
    sourcemap: true,
  },
  external: ['node-fetch', 'url'],
  plugins: [typescript(), resolve()],
};

export default [nodeConfig, uiConfig, uiWorkerConfig];
