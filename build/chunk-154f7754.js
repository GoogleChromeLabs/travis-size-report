#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var escapeRE = _interopDefault(require('escape-string-regexp'));

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
function validateFindRenamedPattern(pattern) {
    if (!isPlainName(pattern)) {
        throw new TypeError(`Invalid output pattern "${pattern}, cannot be an absolute or relative path.`);
    }
    escapeRE(pattern).replace(PLACEHOLDER_REGEX, (_match, type) => {
        const replacement = REPLACEMENTS[type];
        if (replacement == undefined) {
            throw new TypeError(`"${type}" is not a valid substitution name`);
        }
        return replacement;
    });
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
    validateFindRenamedPattern(pattern);
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

const buildSizePrefix = '=== BUILD SIZES: ';
const buildSizePrefixRe = new RegExp(`^${buildSizePrefix}(.+)$`, 'm');
function fetchTravis(path, searchParams = {}) {
    const url = new URL(path, 'https://api.travis-ci.org');
    url.search = new URLSearchParams(searchParams).toString();
    return fetch(url.href, {
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
function getFileDataFromTravis(builds) {
    return Promise.all(builds.map(async (build) => {
        const jobUrl = build.jobs[0]['@href'];
        const response = await fetchTravis(jobUrl + '/log.txt');
        const log = await response.text();
        const reResult = buildSizePrefixRe.exec(log);
        if (!reResult)
            return undefined;
        return JSON.parse(reResult[1]);
    }));
}
/**
 * Scrape Travis for the previous build info.
 */
async function getBuildInfo(user, repo, branch, limit = 1) {
    let fileData;
    try {
        const buildData = await fetchTravisBuildInfo(user, repo, branch, limit);
        fileData = await getFileDataFromTravis(buildData.builds);
    }
    catch (err) {
        throw new Error(`Couldn't parse build info`);
    }
    return fileData;
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

exports.buildFindRenamedFunc = buildFindRenamedFunc;
exports.buildSizePrefix = buildSizePrefix;
exports.getBuildInfo = getBuildInfo;
exports.getChanges = getChanges;
//# sourceMappingURL=chunk-154f7754.js.map
