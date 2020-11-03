"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
const pretty_bytes_1 = __importDefault(require("pretty-bytes"));
const find_renamed_1 = require("./find-renamed");
const utils_1 = require("./utils");
const { GITHUB_TOKEN, PR_NUMBER } = process.env;
const hiddenDataMarker = 'botsData';
console.log('size-report tokens', {
    GITHUB_TOKEN,
    PR_NUMBER,
});
let ghMdOutput = '';
let ghMdCollapsedOutput = '';
const ascendingSizeSort = (a, b) => a.bytesDiff - b.bytesDiff;
const descendingSizeSort = (a, b) => b.bytesDiff - a.bytesDiff;
function getHiddenData(str) {
    const markerIndex = str.indexOf(hiddenDataMarker);
    if (markerIndex === -1) {
        return {
            sizeReport: {},
        };
    }
    const startIndex = markerIndex + hiddenDataMarker.length;
    const remainingStr = str.substring(startIndex);
    const endIndex = remainingStr.indexOf('-->');
    const jsonString = str.substring(startIndex, startIndex + endIndex);
    return JSON.parse(jsonString);
}
function updateCommentId(params = {}) {
    const { issueBody, hiddenData, commentId } = params;
    const markerIndex = issueBody.indexOf(`<!--${hiddenDataMarker}`);
    const textEndIndex = markerIndex === -1 ? issueBody.length : markerIndex;
    const text = issueBody.substring(0, textEndIndex).trimRight();
    hiddenData.sizeReport.lastCommentId = commentId;
    const hiddenDataString = `${text}\n\n<!--botsData\n${JSON.stringify(hiddenData)}\n-->\n<!-- WARNING: Don't delete the content inside botData -->`;
    return hiddenDataString;
}
function getGitHubIssue(params = {}) {
    const { user, repo, pr } = params;
    const url = `https://api.github.com/repos/${user}/${repo}/issues/${pr}`;
    console.log('getGitHubIssue url', url);
    return node_fetch_1.default(url, {
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
        },
    });
}
function updateGitHubIssue(params = {}, body) {
    const { user, repo, pr } = params;
    const url = `https://api.github.com/repos/${user}/${repo}/issues/${pr}`;
    console.log('updateGitHubIssue url', url);
    return node_fetch_1.default(url, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `token ${GITHUB_TOKEN}`,
        },
    });
}
function commentGitHub(params = {}, body) {
    const { user, repo, pr } = params;
    const url = `https://api.github.com/repos/${user}/${repo}/issues/${pr}/comments`;
    console.log('commentGitHub url', url);
    return node_fetch_1.default(url, {
        method: 'POST',
        body: JSON.stringify({ body }),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `token ${GITHUB_TOKEN}`,
        },
    });
}
function deleteCommentGitHub(params = {}) {
    const { user, repo, commentId } = params;
    const url = `https://api.github.com/repos/${user}/${repo}/issues/comments/${commentId}`;
    console.log('delete url', url);
    return node_fetch_1.default(url, {
        method: 'DELETE',
        headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
        },
    });
}
/**
 * Get previous build info from HackerRank CDN.
 */
async function fetchPreviousBuildInfo(cdnUrl) {
    const r = await node_fetch_1.default(`${cdnUrl}/buildsize.json`);
    const json = r.json();
    return json;
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
function collapsedOutput(text) {
    ghMdCollapsedOutput = ghMdCollapsedOutput + '\n' + text;
}
function outputChanges(changes) {
    if (changes.newItems.length === 0 &&
        changes.deletedItems.length === 0 &&
        changes.changedItems.size === 0) {
        output(`#### :raised_hands:   No changes.`);
        return;
    }
    output(`### Changes in existing chunks :pencil2:`);
    output(`| Size Change | Current Size | Status | Chunk`);
    output(`| --- | --- | :---: | :--- |`);
    const increasedChunks = [];
    const decreasedChunks = [];
    const minorIncChunks = [];
    const minorDecChunks = [];
    const renamedChunks = [];
    for (const [oldFile, newFile] of changes.changedItems.entries()) {
        // Changed file.
        const size = pretty_bytes_1.default(newFile.gzipSize);
        const bytesDiff = newFile.gzipSize - oldFile.gzipSize;
        const sizeDiff = pretty_bytes_1.default(bytesDiff, { signed: true });
        const changeEmoji = newFile.gzipSize > oldFile.gzipSize ? ':small_red_triangle:' : ':arrow_down:';
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
        else if (bytesDiff > 0) {
            minorIncChunks.push(chunkData);
        }
        if (bytesDiff < -100) {
            decreasedChunks.push(chunkData);
        }
        else if (bytesDiff < 0) {
            minorDecChunks.push(chunkData);
        }
        if (bytesDiff === 0) {
            chunkData.changeEmoji = ':o:';
            renamedChunks.push(chunkData);
        }
    }
    increasedChunks.sort(descendingSizeSort);
    decreasedChunks.sort(ascendingSizeSort);
    minorIncChunks.sort(descendingSizeSort);
    minorDecChunks.sort(ascendingSizeSort);
    const majorChunks = [...increasedChunks, ...decreasedChunks];
    const minorChunks = [...renamedChunks, ...minorIncChunks, ...minorDecChunks];
    for (const chunk of majorChunks) {
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
        output(`| **${size}** | :negative_squared_cross_mark: | ${file.name}`);
    }
    collapsedOutput(`| Size Change | Current Size | Status | Chunk`);
    collapsedOutput(`| --- | --- | :---: | :--- |`);
    for (const chunk of minorChunks) {
        const { sizeDiff, size, changeEmoji, name } = chunk;
        collapsedOutput(`| ${sizeDiff} | ${size} | ${changeEmoji} | ${name}`);
    }
}
async function sizeReport(user, repo, files, cdnUrl, { findRenamed } = {}) {
    if (typeof findRenamed === 'string')
        findRenamed = find_renamed_1.buildFindRenamedFunc(findRenamed);
    const pr = PR_NUMBER;
    const buildInfo = await utils_1.getBuildInfo(files);
    console.log('=== Build Size ===');
    console.log(buildInfo);
    console.log('\nBuild change report sending to GitHub PR as comment:');
    let previousBuildInfo;
    try {
        previousBuildInfo = await fetchPreviousBuildInfo(cdnUrl);
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
    ghMdOutput += `\n<details><summary>Minor Changes</summary>\n${ghMdCollapsedOutput}\n</details>`;
    console.log('=== Changes ===');
    console.log(ghMdOutput);
    const issueRes = await getGitHubIssue({ user, repo, pr });
    const issueData = await issueRes.json();
    const issueBody = issueData.body;
    const hiddenData = getHiddenData(issueBody);
    const { lastCommentId } = hiddenData.sizeReport;
    const commentRes = await commentGitHub({ user, repo, pr }, ghMdOutput);
    const commentData = await commentRes.json();
    const commentId = commentData.id;
    const updatedIssueBody = updateCommentId({ issueBody, hiddenData, commentId });
    await updateGitHubIssue({ user, repo, pr }, updatedIssueBody);
    await deleteCommentGitHub({ user, repo, commentId: lastCommentId });
}
exports.default = sizeReport;
