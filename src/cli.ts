import path from 'path';
import minimist from 'minimist';

const argv = minimist(process.argv.slice(2), {
  alias: { c: 'config' },
});

// Read arguments from command line
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
  buildSizePath: string;
  cdnUrl: string;
  /**
   * By default, a renamed file will look like one file deleted and another created.
   * By writing a findRenamed callback, you can tell travis-size-report that a file was renamed.
   */
  findRenamed?: string | import('./find-renamed').FindRenamed;
}

export function getConfig(): Config {
  let config: any = {};

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

  if (!config.repo) throw TypeError('No repo given');
  if (!config.path) throw TypeError('No path given');
  if (!config.repo.includes('/')) throw TypeError("Repo doesn't look like repo value");

  config.buildSizePath = config.buildSizePath || 'public/assets';

  if (typeof config.path === 'string') config.path = [config.path];

  return config;
}
