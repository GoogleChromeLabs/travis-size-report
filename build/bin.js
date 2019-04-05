#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const minimist_1 = __importDefault(require("minimist"));
const _1 = __importDefault(require("."));
const argv = minimist_1.default(process.argv.slice(2), {
    string: ['branch'],
    alias: { c: 'config' },
    default: {
        branch: 'master',
    },
});
const branch = argv.branch;
const configFile = argv.config;
const repo = argv._[0];
const glob = argv._[1];
let config = {};
if (configFile) {
    config = require(path_1.default.join(process.cwd(), configFile === true ? 'sizereport.config.js' : configFile));
}
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
_1.default(user, repoName, config.path, opts);
