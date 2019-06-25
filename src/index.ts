import { promisify } from 'util';
import { stat } from 'fs';
import { URL, URLSearchParams } from 'url';

import glob from 'glob';
import gzipSize from 'gzip-size';
import escapeRE from 'escape-string-regexp';
import fetch, { Response } from 'node-fetch';
import prettyBytes from 'pretty-bytes';
import { buildFindRenamedFunc, FindRenamed } from './find-renamed';

const { TRAVIS_TOKEN, GITHUB_TOKEN, TRAVIS_PULL_REQUEST } = process.env;

console.log('see if env vars are given properly', {
  TRAVIS_TOKEN,
  GITHUB_TOKEN,
  TRAVIS_PULL_REQUEST,
});

const globP = promisify(glob);
const statP = promisify(stat);

let ghMdOutput = '';

interface FileData {
  name: string;
  path: string;
  size: number;
  gzipSize: number;
}

const buildSizePrefix = '=== BUILD SIZES: ';
const buildSizePrefixRe = new RegExp(`^${escapeRE(buildSizePrefix)}(.+)$`, 'm');

function escapeTilde(str: string) {
  return str.replace(/\~/g, '\\~');
}

/**
 * Recursively-read a directory and turn it into an array of FileDatas
 */
function pathsToInfoArray(paths: string[]): Promise<FileData[]> {
  return Promise.all(
    paths.map(async path => {
      const lastSlashIndex = path.lastIndexOf('/');
      const lastHiphenIndex = path.lastIndexOf('-');

      const name = escapeTilde(path.substring(lastSlashIndex + 1, lastHiphenIndex));
      const gzipSizePromise = gzipSize.file(path);
      const statSizePromise = statP(path).then(s => s.size);

      return {
        name,
        path,
        size: await statSizePromise,
        gzipSize: await gzipSizePromise,
      };
    }),
  );
}

function fetchGitHub(params: any = {}, body: any) {
  const { user, repo, pr } = params;
  const url = `https://api.github.com/repos/${user}/${repo}/issues/${pr}/comments`;
  console.log('url', url);
  return fetch(url, {
    method: 'POST',
    body: JSON.stringify({ body }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  });
}

function fetchTravis(
  path: string,
  searchParams: { [propName: string]: string } = {},
): Promise<Response> {
  const url = new URL(path, 'https://api.travis-ci.com');
  url.search = new URLSearchParams(searchParams).toString();

  return fetch(url.href, {
    headers: {
      'Travis-API-Version': '3',
      Authorization: `token ${TRAVIS_TOKEN}`,
    },
  });
}

function fetchTravisBuildInfo(user: string, repo: string, branch: string) {
  return fetchTravis(`/repo/${encodeURIComponent(`${user}/${repo}`)}/builds`, {
    'branch.name': branch,
    state: 'passed',
    limit: '1',
    event_type: 'push',
  }).then(r => r.json());
}

function fetchTravisText(path: string): Promise<string> {
  return fetchTravis(path).then(r => r.text());
}

/**
 * Scrape Travis for the previous build info.
 */
async function getPreviousBuildInfo(
  user: string,
  repo: string,
  branch: string,
): Promise<FileData[] | undefined> {
  const buildData = await fetchTravisBuildInfo(user, repo, branch);
  const jobUrl = buildData.builds[0].jobs[0]['@href'];
  const log = await fetchTravisText(jobUrl + '/log.txt');
  const reResult = buildSizePrefixRe.exec(log);

  if (!reResult) return;
  return JSON.parse(reResult[1]);
}

interface BuildChanges {
  deletedItems: FileData[];
  newItems: FileData[];
  changedItems: Map<FileData, FileData>;
}

/**
 * Generate an array that represents the difference between builds.
 * Returns an array of { beforeName, afterName, beforeSize, afterSize }.
 * Sizes are gzipped size.
 * Before/after properties are missing if resource isn't in the previous/new build.
 */
async function getChanges(
  previousBuildInfo: FileData[],
  buildInfo: FileData[],
  findRenamed?: FindRenamed,
): Promise<BuildChanges> {
  const deletedItems: FileData[] = [];
  const changedItems = new Map<FileData, FileData>();
  const matchedNewEntries = new Set<FileData>();

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

  const newItems: FileData[] = [];

  // Look for entries that are only in the new build.
  for (const newEntry of buildInfo) {
    if (matchedNewEntries.has(newEntry)) continue;
    newItems.push(newEntry);
  }

  // Figure out renamed files.
  if (findRenamed) {
    const originalDeletedItems = deletedItems.slice();
    const newPaths = newItems.map(i => i.path);

    for (const deletedItem of originalDeletedItems) {
      const result = await findRenamed(deletedItem.path, newPaths);
      if (!result) continue;
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

function output(text: string) {
  ghMdOutput = ghMdOutput + '\n' + text;
}

function outputChanges(changes: BuildChanges) {
  if (
    changes.newItems.length === 0 &&
    changes.deletedItems.length === 0 &&
    changes.changedItems.size === 0
  ) {
    output(`#### :raised_hands:   No changes.`);
  }

  output(`### Changes in existing chunks :pencil2:`);
  output(`| Size Change | Current Size | Status | Chunk`);
  output(`| --- | --- | :---: | :--- |`);

  const increasedChunks: any = [];
  const decreasedChunks: any = [];

  for (const [oldFile, newFile] of changes.changedItems.entries()) {
    // Changed file.
    const size = prettyBytes(newFile.gzipSize);

    const bytesDiff = newFile.gzipSize - oldFile.gzipSize;
    const sizeDiff = prettyBytes(bytesDiff, { signed: true });
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

  increasedChunks.sort((a: any, b: any) => b.bytesDiff - a.bytesDiff);
  decreasedChunks.sort((a: any, b: any) => a.bytesDiff - b.bytesDiff);

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
    const size = prettyBytes(file.gzipSize);
    output(`| **${size}** | :exclamation: | ${file.name}`);
  }

  output(`### Removed chunks :heavy_minus_sign:`);
  output(`Size | Status | Chunk`);
  output(`| --- | :---: | :--- |`);
  for (const file of changes.deletedItems) {
    const size = prettyBytes(file.gzipSize);
    output(`| **${size}** | :grey_exclamation: | ${file.name}`);
  }
}

export interface SizeReportOptions {
  /** Branch to compare to. Defaults to 'master' */
  branch?: string;
  /**
   * Join together a missing file and a new file which should be considered the same (as in,
   * renamed).
   *
   * Return nothing to indicate `filePath` has been removed from the new build, or return one of the
   * strings in `newFiles` to treat it as a rename.
   *
   * This can be async, returning a promise for a string or undefined.
   */
  findRenamed?: string | FindRenamed;
}

export default async function sizeReport(
  user: string,
  repo: string,
  files: string | readonly string[],
  { branch = 'master', findRenamed }: SizeReportOptions = {},
): Promise<void> {
  if (typeof files === 'string') files = [files];
  if (typeof findRenamed === 'string') findRenamed = buildFindRenamedFunc(findRenamed);

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
  } catch (err) {
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
