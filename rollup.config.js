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

export default [nodeConfig];
