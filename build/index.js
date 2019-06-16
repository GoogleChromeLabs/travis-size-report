"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const fs_1 = require("fs");
const url_1 = require("url");
const glob_1 = __importDefault(require("glob"));
const gzip_size_1 = __importDefault(require("gzip-size"));
const escape_string_regexp_1 = __importDefault(require("escape-string-regexp"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const chalk_1 = __importDefault(require("chalk"));
const pretty_bytes_1 = __importDefault(require("pretty-bytes"));
const find_renamed_1 = require("./find-renamed");
const globP = util_1.promisify(glob_1.default);
const statP = util_1.promisify(fs_1.stat);
// Travis reports it doesn't support colour. IT IS WRONG.
const alwaysChalk = new chalk_1.default.constructor({ level: 4 });
const buildSizePrefix = '=== BUILD SIZES: ';
const buildSizePrefixRe = new RegExp(`^${escape_string_regexp_1.default(buildSizePrefix)}(.+)$`, 'm');
/**
 * Recursively-read a directory and turn it into an array of FileDatas
 */
function pathsToInfoArray(paths) {
    return Promise.all(paths.map(async (path) => {
        const gzipSizePromise = gzip_size_1.default.file(path);
        const statSizePromise = statP(path).then(s => s.size);
        return {
            path,
            size: await statSizePromise,
            gzipSize: await gzipSizePromise,
        };
    }));
}
function fetchTravis(path, searchParams = {}) {
    const url = new url_1.URL(path, 'https://api.travis-ci.org');
    url.search = new url_1.URLSearchParams(searchParams).toString();
    return node_fetch_1.default(url.href, {
        headers: { 'Travis-API-Version': '3' },
    });
}
function fetchTravisBuildInfo(user, repo, branch) {
    return fetchTravis(`/repo/${encodeURIComponent(`${user}/${repo}`)}/builds`, {
        'branch.name': branch,
        state: 'passed',
        limit: '1',
        event_type: 'push',
    }).then(r => r.json());
}
function fetchTravisText(path) {
    return fetchTravis(path).then(r => r.text());
}
/**
 * Scrape Travis for the previous build info.
 */
async function getPreviousBuildInfo(user, repo, branch) {
    const buildData = await fetchTravisBuildInfo(user, repo, branch);
    const jobUrl = buildData.builds[0].jobs[0]['@href'];
    const log = await fetchTravisText(jobUrl + '/log.txt');
    const reResult = buildSizePrefixRe.exec(log);
    if (!reResult)
        return;
    return JSON.parse(reResult[1]);
}
/**
 * Generate an array that represents the difference between builds.
 * Returns an array of { beforeName, afterName, beforeSize, afterSize }.
 * Sizes are gzipped size.
 * Before/after properties are missing if resource isn't in the previous/new build.
 */
async function getChanges(previousBuildInfo, buildInfo, findRenamed) {
    const deletedItems = [];
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
    return { newItems, deletedItems, changedItems };
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
        console.log(`  ${g('ADDED')}   ${file.path} - ${pretty_bytes_1.default(file.gzipSize)}`);
    }
    for (const file of changes.deletedItems) {
        console.log(`  ${r('REMOVED')} ${file.path} - was ${pretty_bytes_1.default(file.gzipSize)}`);
    }
    for (const [oldFile, newFile] of changes.changedItems.entries()) {
        // Changed file.
        let size;
        if (oldFile.gzipSize === newFile.gzipSize) {
            // Just renamed.
            size = `${pretty_bytes_1.default(newFile.gzipSize)} -> no change`;
        }
        else {
            const color = newFile.gzipSize > oldFile.gzipSize ? r : g;
            const sizeDiff = pretty_bytes_1.default(newFile.gzipSize - oldFile.gzipSize, { signed: true });
            const relativeDiff = Math.round((newFile.gzipSize / oldFile.gzipSize) * 1000) / 1000;
            size =
                `${pretty_bytes_1.default(oldFile.gzipSize)} -> ${pretty_bytes_1.default(newFile.gzipSize)}` +
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
        findRenamed = find_renamed_1.buildFindRenamedFunc(findRenamed);
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
exports.default = sizeReport;
