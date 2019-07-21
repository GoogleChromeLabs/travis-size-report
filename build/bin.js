#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var path = require('path');
var minimist = _interopDefault(require('minimist'));
require('util');
require('fs');
require('url');
require('node-fetch');
require('glob');
require('gzip-size');
require('chalk');
require('pretty-bytes');
require('escape-string-regexp');
var index = require('./index.js');

const argv = minimist(process.argv.slice(2), {
    string: ['branch'],
    alias: { c: 'config' },
});
// Read arguments from command line
const branch = argv.branch;
const configFile = argv.config;
const repo = argv._[0];
const glob = argv._[1];
let config = {};
// Read arguments from config file
if (configFile) {
    config = require(path.join(process.cwd(), configFile === true ? 'sizereport.config.js' : configFile));
}
// Override config file with command line arguments
if (repo)
    config.repo = repo;
if (glob)
    config.path = glob;
if (branch)
    config.branch = branch;
if (!config.repo)
    throw TypeError('No repo given');
if (!config.path)
    throw TypeError('No path given');
if (!config.repo.includes('/'))
    throw TypeError("Repo doesn't look like repo value");
const [user, repoName] = config.repo.split('/');
const opts = {};
if (config.branch)
    opts.branch = config.branch;
if (config.findRenamed)
    opts.findRenamed = config.findRenamed;
index(user, repoName, config.path, opts);
//# sourceMappingURL=bin.js.map
