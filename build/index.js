#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var util = require('util');
var fs = require('fs');
var url = require('url');
var glob = _interopDefault(require('glob'));
var gzipSize = _interopDefault(require('gzip-size'));
var escapeRE = _interopDefault(require('escape-string-regexp'));
var fetch = _interopDefault(require('node-fetch'));
var chalk = _interopDefault(require('chalk'));
var prettyBytes = _interopDefault(require('pretty-bytes'));

const PLACEHOLDER_REGEX = /\\\[(\w+)\\\]/g;
const REPLACEMENTS = {
    extname: '(\\.\\w+)',
    hash: '[a-f0-9]+',
    name: '(.+)',
};
/**
 * Name doesn't start with "./", "/", "../"
 */
function isPlainName(name) {
    return !(name[0] === '/' ||
        (name[1] === '.' && (name[2] === '/' || (name[2] === '.' && name[3] === '/'))));
}
/**
 * Creates a findRenamed function based on the given `pattern`.
 *
 * Patterns support the following placeholders:
 * - `[extname]`: The file extension of the asset including a leading dot, e.g. `.css`
 * - `[hash]`: A hash based on the name and content of the asset.
 * - `[name]`: The file name of the asset excluding any extension.
 */
function buildFindRenamedFunc(pattern) {
    if (!isPlainName(pattern)) {
        throw new TypeError(`Invalid output pattern "${pattern}, cannot be an absolute or relative path.`);
    }
    // Keep track of which placeholder each regex group corresponds to.
    let i = 1;
    const groups = [];
    // Create a regex to extract parts of the path.
    const parts = escapeRE(pattern).replace(PLACEHOLDER_REGEX, (_match, type) => {
        const replacement = REPLACEMENTS[type];
        if (replacement == undefined) {
            throw new TypeError(`"${type}" is not a valid substitution name`);
        }
        groups[i] = type;
        i++;
        return replacement;
    });
    const partsRe = new RegExp(`^${parts}$`);
    return function generatedFindRenamed(path, newPaths) {
        const oldParts = partsRe.exec(path);
        if (!oldParts)
            return undefined;
        return newPaths.find(newPath => {
            const newParts = partsRe.exec(newPath);
            if (!newParts || newParts.length !== oldParts.length)
                return false;
            for (let i = 1; i < oldParts.length; i++) {
                if (oldParts[i] !== newParts[i] && groups[i] !== 'hash')
                    return false;
            }
            return true;
        });
    };
}

const globP = util.promisify(glob);
const statP = util.promisify(fs.stat);
// Travis reports it doesn't support colour. IT IS WRONG.
const alwaysChalk = new chalk.constructor({ level: 4 });
const buildSizePrefix = '=== BUILD SIZES: ';
const buildSizePrefixRe = new RegExp(`^${escapeRE(buildSizePrefix)}(.+)$`, 'm');
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
function fetchTravis(path, searchParams = {}) {
    const url$1 = new url.URL(path, 'https://api.travis-ci.org');
    url$1.search = new url.URLSearchParams(searchParams).toString();
    return fetch(url$1.href, {
        headers: { 'Travis-API-Version': '3' },
    });
}
function fetchTravisBuildInfo(user, repo, branch, limit = 1) {
    return fetchTravis(`/repo/${encodeURIComponent(`${user}/${repo}`)}/builds`, {
        'branch.name': branch,
        state: 'passed',
        limit: limit.toString(),
        event_type: 'push',
    }).then(r => r.json());
}
function fetchTravisText(path) {
    return fetchTravis(path).then(r => r.text());
}
function getFileDataFromTravis(builds) {
    return Promise.all(builds.map(async (build) => {
        const jobUrl = build.jobs[0]['@href'];
        const log = await fetchTravisText(jobUrl + '/log.txt');
        const reResult = buildSizePrefixRe.exec(log);
        if (!reResult)
            return undefined;
        return JSON.parse(reResult[1]);
    }));
}
/**
 * Scrape Travis for the previous build info.
 */
async function getPreviousBuildInfo(user, repo, branch) {
    const buildData = await fetchTravisBuildInfo(user, repo, branch);
    const fileData = await getFileDataFromTravis(buildData.builds);
    return fileData[0];
}
/**
 * Generate an array that represents the difference between builds.
 * Returns an array of { beforeName, afterName, beforeSize, afterSize }.
 * Sizes are gzipped size.
 * Before/after properties are missing if resource isn't in the previous/new build.
 */
async function getChanges(previousBuildInfo, buildInfo, findRenamed) {
    const deletedItems = [];
    const sameItems = [];
    const changedItems = new Map();
    const matchedNewEntries = new Set();
    for (const oldEntry of previousBuildInfo) {
        const newEntry = buildInfo.find(entry => entry.path === oldEntry.path);
        if (!newEntry) {
            deletedItems.push(oldEntry);
            continue;
        }
        matchedNewEntries.add(newEntry);
        if (oldEntry.gzipSize !== newEntry.gzipSize) {
            changedItems.set(oldEntry, newEntry);
        }
        else {
            sameItems.push(newEntry);
        }
    }
    const newItems = [];
    // Look for entries that are only in the new build.
    for (const newEntry of buildInfo) {
        if (matchedNewEntries.has(newEntry))
            continue;
        newItems.push(newEntry);
    }
    // Figure out renamed files.
    if (findRenamed) {
        const originalDeletedItems = deletedItems.slice();
        const newPaths = newItems.map(i => i.path);
        for (const deletedItem of originalDeletedItems) {
            const result = await findRenamed(deletedItem.path, newPaths);
            if (!result)
                continue;
            if (!newPaths.includes(result)) {
                throw Error(`findRenamed: File isn't part of the new build: ${result}`);
            }
            // Remove items from newPaths, deletedItems and newItems.
            // Add them to mappedItems.
            newPaths.splice(newPaths.indexOf(result), 1);
            deletedItems.splice(deletedItems.indexOf(deletedItem), 1);
            const newItemIndex = newItems.findIndex(i => i.path === result);
            changedItems.set(deletedItem, newItems[newItemIndex]);
            newItems.splice(newItemIndex, 1);
        }
    }
    return { newItems, deletedItems, sameItems, changedItems };
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
        findRenamed = buildFindRenamedFunc(findRenamed);
    // Get target files
    const filePaths = [];
    for (const glob of files) {
        const matches = await globP(glob, { nodir: true });
        filePaths.push(...matches);
    }
    const uniqueFilePaths = [...new Set(filePaths)];
    // Output the current build sizes for later retrieval.
    const buildInfo = await pathsToInfoArray(uniqueFilePaths);
    console.log(buildSizePrefix + JSON.stringify(buildInfo));
    console.log('\nBuild change report:');
    let previousBuildInfo;
    try {
        previousBuildInfo = await getPreviousBuildInfo(user, repo, branch);
    }
    catch (err) {
        console.log(`  Couldn't parse previous build info`);
        return;
    }
    if (!previousBuildInfo) {
        console.log(`  Couldn't find previous build info`);
        return;
    }
    const buildChanges = await getChanges(previousBuildInfo, buildInfo, findRenamed);
    outputChanges(buildChanges);
}

module.exports = sizeReport;
//# sourceMappingURL=index.js.map
