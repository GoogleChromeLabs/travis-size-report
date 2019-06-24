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
const pretty_bytes_1 = __importDefault(require("pretty-bytes"));
const find_renamed_1 = require("./find-renamed");
const { TRAVIS_TOKEN, GITHUB_TOKEN, TRAVIS_PULL_REQUEST } = process.env;
console.log('see if env vars are given properly', {
    TRAVIS_TOKEN,
    GITHUB_TOKEN,
    TRAVIS_PULL_REQUEST,
});
const globP = util_1.promisify(glob_1.default);
const statP = util_1.promisify(fs_1.stat);
let ghMdOutput = '';
const buildSizePrefix = '=== BUILD SIZES: ';
const buildSizePrefixRe = new RegExp(`^${escape_string_regexp_1.default(buildSizePrefix)}(.+)$`, 'm');
function escapeTilde(str) {
    return str.replace(/\~/g, '\\~');
}
/**
 * Recursively-read a directory and turn it into an array of FileDatas
 */
function pathsToInfoArray(paths) {
    return Promise.all(paths.map(async (path) => {
        const lastSlashIndex = path.lastIndexOf('/');
        const lastHiphenIndex = path.lastIndexOf('-');
        const name = escapeTilde(path.substring(lastSlashIndex + 1, lastHiphenIndex));
        const gzipSizePromise = gzip_size_1.default.file(path);
        const statSizePromise = statP(path).then(s => s.size);
        return {
            name,
            path,
            size: await statSizePromise,
            gzipSize: await gzipSizePromise,
        };
    }));
}
function fetchGitHub(params = {}, body) {
    const { user, repo, pr } = params;
    const url = `https://api.github.com/repos/${user}/${repo}/issues/${pr}/comments`;
    console.log('url', url);
    return node_fetch_1.default(url, {
        method: 'POST',
        body: JSON.stringify({ body }),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `token ${GITHUB_TOKEN}`,
        },
    });
}
function fetchTravis(path, searchParams = {}) {
    const url = new url_1.URL(path, 'https://api.travis-ci.com');
    url.search = new url_1.URLSearchParams(searchParams).toString();
    return node_fetch_1.default(url.href, {
        headers: {
            'Travis-API-Version': '3',
            Authorization: `token ${TRAVIS_TOKEN}`,
        },
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
function output(text) {
    ghMdOutput = ghMdOutput + '\n' + text;
}
function outputChanges(changes) {
    if (changes.newItems.length === 0 &&
        changes.deletedItems.length === 0 &&
        changes.changedItems.size === 0) {
        output(`#### :raised_hands:   No changes.`);
    }
    output(`### Changes in existing chunks :pencil2:`);
    output(`| Size Change | Current Size | Status | Chunk`);
    output(`| --- | --- | :---: | :--- |`);
    const increasedChunks = [];
    const decreasedChunks = [];
    for (const [oldFile, newFile] of changes.changedItems.entries()) {
        // Changed file.
        const size = pretty_bytes_1.default(newFile.gzipSize);
        const bytesDiff = newFile.gzipSize - oldFile.gzipSize;
        const sizeDiff = pretty_bytes_1.default(bytesDiff, { signed: true });
        const changeEmoji = newFile.gzipSize > oldFile.gzipSize ? ':arrow_double_up:' : ':arrow_down:';
        const chunkData = {
            sizeDiff,
            size,
            bytesDiff,
            changeEmoji,
            name: newFile.name,
        };
        if (bytesDiff > 100) {
            increasedChunks.push(chunkData);
        }
        if (bytesDiff < -100) {
            decreasedChunks.push(chunkData);
        }
    }
    increasedChunks.sort((a, b) => b.bytesDiff - a.bytesDiff);
    decreasedChunks.sort((a, b) => a.bytesDiff - b.bytesDiff);
    for (const chunk of increasedChunks) {
        const { sizeDiff, size, changeEmoji, name } = chunk;
        output(`| **${sizeDiff}** | ${size} | ${changeEmoji} | ${name}`);
    }
    for (const chunk of decreasedChunks) {
        const { sizeDiff, size, changeEmoji, name } = chunk;
        output(`| **${sizeDiff}** | ${size} | ${changeEmoji} | ${name}`);
    }
    output(`### New chunks :heavy_plus_sign:`);
    output(`Size | Status | Chunk`);
    output(`| --- | :---: | :--- |`);
    for (const file of changes.newItems) {
        const size = pretty_bytes_1.default(file.gzipSize);
        output(`| **${size}** | :exclamation: | ${file.name}`);
    }
    output(`### Removed chunks :heavy_minus_sign:`);
    output(`Size | Status | Chunk`);
    output(`| --- | :---: | :--- |`);
    for (const file of changes.deletedItems) {
        const size = pretty_bytes_1.default(file.gzipSize);
        output(`| **${size}** | :grey_exclamation: | ${file.name}`);
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
    await fetchGitHub({ user, repo, pr: TRAVIS_PULL_REQUEST }, ghMdOutput);
}
exports.default = sizeReport;
