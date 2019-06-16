#!/usr/bin/env node
import path from 'path';
import minimist from 'minimist';
import sizeReport, { SizeReportOptions } from '.';

const argv = minimist(process.argv.slice(2), {
  string: ['branch'],
  alias: { c: 'config' },
});

// Read arguments from command line
const branch = argv.branch as string;
const configFile = argv.config as string | boolean;
const repo = argv._[0] as string | undefined;
const glob = argv._[1] as string | undefined;

/**
 * Configuration file for travis-size-report.
 * This is typically `sizereport.config.js`.
 */
export interface Config {
  /**
   * The username/repo-name
   * @example
   * repo: "GoogleChromeLabs/travis-size-report"
   */
  repo: string;
  /**
   * The glob (or array of globs) of files to include in the report.
   * @example
   * path: 'dist/*'
   */
  path: string | readonly string[];
  /**
   * The branch to check against.
   * @default 'master'
   * @example
   * branch: 'develop'
   */
  branch?: string;
  /**
   * By default, a renamed file will look like one file deleted and another created.
   * By writing a findRenamed callback, you can tell travis-size-report that a file was renamed.
   */
  findRenamed?: string | import('./find-renamed').FindRenamed;
}

let config: Partial<Config> = {};

// Read arguments from config file
if (configFile) {
  config = require(path.join(
    process.cwd(),
    configFile === true ? 'sizereport.config.js' : configFile,
  ));
}

// Override config file with command line arguments
if (repo) config.repo = repo;
if (glob) config.path = glob;
if (branch) config.branch = branch;

if (!config.repo) throw TypeError('No repo given');
if (!config.path) throw TypeError('No path given');
if (!config.repo.includes('/')) throw TypeError("Repo doesn't look like repo value");

const [user, repoName] = config.repo.split('/');
const opts: SizeReportOptions = {};
if (config.branch) opts.branch = config.branch;
if (config.findRenamed) opts.findRenamed = config.findRenamed;

sizeReport(user, repoName, config.path, opts);
