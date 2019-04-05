import { promisify } from 'util';
import { stat } from 'fs';
import { URL, URLSearchParams } from 'url';

import glob from 'glob';
import gzipSize from 'gzip-size';
import escapeRE from 'escape-string-regexp';
import fetch, { Response } from 'node-fetch';
import chalk from 'chalk';
import prettyBytes from 'pretty-bytes';

const globP = promisify(glob);
const statP = promisify(stat);
// Travis reports it doesn't support colour. IT IS WRONG.
const alwaysChalk = new chalk.constructor({ level: 4 });

interface FileData {
  path: string;
  size: number;
  gzipSize: number;
}

const buildSizePrefix = '=== BUILD SIZES: ';
const buildSizePrefixRe = new RegExp(`^${escapeRE(buildSizePrefix)}(.+)$`, 'm');

/**
 * Recursively-read a directory and turn it into an array of FileDatas
 */
function pathsToInfoArray(paths: string[]): Promise<FileData[]> {
  return Promise.all(
    paths.map(async path => {
      const gzipSizePromise = gzipSize.file(path);
      const statSizePromise = statP(path).then(s => s.size);

      return {
        path,
        size: await statSizePromise,
        gzipSize: await gzipSizePromise,
      };
    }),
  );
}

function fetchTravis(
  path: string,
  searchParams: { [propName: string]: string } = {},
): Promise<Response> {
  const url = new URL(path, 'https://api.travis-ci.org');
  url.search = new URLSearchParams(searchParams).toString();

  return fetch(url.href, {
    headers: { 'Travis-API-Version': '3' },
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
  findRenamed: SizeReportOptions['findRenamed'],
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

function outputChanges(changes: BuildChanges) {
  // One letter references, so it's easier to get the spacing right.
  const y = alwaysChalk.yellow;
  const g = alwaysChalk.green;
  const r = alwaysChalk.red;

  if (
    changes.newItems.length === 0 &&
    changes.deletedItems.length === 0 &&
    changes.changedItems.size === 0
  ) {
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
    } else {
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

export type FindRenamed = (
  /** Path of a file that's missing in the latest build */
  filePath: string,
  /** Paths of files that are new in the latest build */
  newFiles: string[],
) => string | void | Promise<void> | Promise<string>;

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
  findRenamed?: FindRenamed;
}

export default async function sizeReport(
  user: string,
  repo: string,
  files: string | string[],
  { branch = 'master', findRenamed }: SizeReportOptions = {},
): Promise<void> {
  if (typeof files === 'string') files = [files];

  // Get target files
  const filePaths = [];

  for (const glob of files) {
    filePaths.push(...(await globP(glob)));
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
}
