#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var util = require('util');
var fs = require('fs');
var url = require('url');
var fetch = _interopDefault(require('node-fetch'));
var glob$1 = _interopDefault(require('glob'));
var gzipSize = _interopDefault(require('gzip-size'));
var chalk = _interopDefault(require('chalk'));
var prettyBytes = _interopDefault(require('pretty-bytes'));
require('escape-string-regexp');
var __chunk_1 = require('./chunk-ba6954f5.js');

Object.assign(global, { URL: url.URL, URLSearchParams: url.URLSearchParams, fetch });
const globP = util.promisify(glob$1);
const statP = util.promisify(fs.stat);
// Travis reports it doesn't support colour. IT IS WRONG.
const alwaysChalk = new chalk.constructor({ level: 4 });
/**
 * Recursively-read a directory and turn it into an array of FileDatas
 */
function pathsToInfoArray(paths) {
    return Promise.all(paths.map(async (path) => {
        const gzipSizePromise = gzipSize.file(path);
        const statSizePromise = statP(path).then(s => s.size);
        return {
            path,
            size: await statSizePromise,
            gzipSize: await gzipSizePromise,
        };
    }));
}
function outputChanges(changes) {
    // One letter references, so it's easier to get the spacing right.
    const y = alwaysChalk.yellow;
    const g = alwaysChalk.green;
    const r = alwaysChalk.red;
    if (changes.newItems.length === 0 &&
        changes.deletedItems.length === 0 &&
        changes.changedItems.size === 0) {
        console.log(`  No changes.`);
    }
    for (const file of changes.newItems) {
        console.log(`  ${g('ADDED')}   ${file.path} - ${prettyBytes(file.gzipSize)}`);
    }
    for (const file of changes.deletedItems) {
        console.log(`  ${r('REMOVED')} ${file.path} - was ${prettyBytes(file.gzipSize)}`);
    }
    for (const [oldFile, newFile] of changes.changedItems.entries()) {
        // Changed file.
        let size;
        if (oldFile.gzipSize === newFile.gzipSize) {
            // Just renamed.
            size = `${prettyBytes(newFile.gzipSize)} -> no change`;
        }
        else {
            const color = newFile.gzipSize > oldFile.gzipSize ? r : g;
            const sizeDiff = prettyBytes(newFile.gzipSize - oldFile.gzipSize, { signed: true });
            const relativeDiff = Math.round((newFile.gzipSize / oldFile.gzipSize) * 1000) / 1000;
            size =
                `${prettyBytes(oldFile.gzipSize)} -> ${prettyBytes(newFile.gzipSize)}` +
                    ' (' +
                    color(`${sizeDiff}, ${relativeDiff}x`) +
                    ')';
        }
        console.log(`  ${y('CHANGED')} ${newFile.path} - ${size}`);
        if (oldFile.path !== newFile.path) {
            console.log(`    Renamed from: ${oldFile.path}`);
        }
    }
}
async function sizeReport(user, repo, files, { branch = 'master', findRenamed } = {}) {
    if (typeof files === 'string')
        files = [files];
    if (typeof findRenamed === 'string')
        findRenamed = __chunk_1.buildFindRenamedFunc(findRenamed);
    // Get target files
    const filePaths = [];
    for (const glob of files) {
        const matches = await globP(glob, { nodir: true });
        filePaths.push(...matches);
    }
    const uniqueFilePaths = [...new Set(filePaths)];
    // Output the current build sizes for later retrieval.
    const buildInfo = await pathsToInfoArray(uniqueFilePaths);
    console.log(__chunk_1.buildSizePrefix + JSON.stringify(buildInfo));
    console.log('\nBuild change report:');
    let previousBuildInfo;
    try {
        [previousBuildInfo] = await __chunk_1.getBuildInfo(user, repo, branch);
    }
    catch (err) {
        console.log(`  Couldn't parse previous build info`);
        return;
    }
    if (!previousBuildInfo) {
        console.log(`  Couldn't find previous build info`);
        return;
    }
    const buildChanges = await __chunk_1.getChanges(previousBuildInfo, buildInfo, findRenamed);
    outputChanges(buildChanges);
}

module.exports = sizeReport;
//# sourceMappingURL=index.js.map
