import path from 'path';
import minimist from 'minimist';
import sizeReport from '.';

const argv = minimist(process.argv.slice(2), {
  string: ['branch', 'config'],
  alias: { c: 'config' },
  default: {
    branch: 'master',
  },
});

const branch = argv.branch as string;
const configFile = argv.config as string | boolean;
const repo = argv._[0] as string | undefined;
const glob = argv._[1] as string | undefined;

interface Config {
  repo?: string;
  path?: string;
  branch?: string;
  findRenamed?: import('.').FindRenamed;
}

let config: Config = {};

if (configFile) {
  config = require(path.join(
    process.cwd(),
    configFile === true ? 'sizereport.config.js' : configFile,
  ));
}

if (repo) config.repo = repo;
if (glob) config.path = glob;
if (branch) config.branch = branch;

if (!config.repo) throw TypeError('No repo given');
if (!config.path) throw TypeError('No path given');
if (!config.repo.includes('/')) throw TypeError("Repo doesn't look like repo value");

const [user, repoName] = config.repo.split('/');
const opts: import('.').SizeReportOptions = {};
if (config.branch) opts.branch = config.branch;
if (config.findRenamed) opts.findRenamed = config.findRenamed;

sizeReport(user, repoName, config.path, opts);
