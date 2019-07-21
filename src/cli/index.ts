import { promisify } from 'util';
import { stat } from 'fs';
import { URL, URLSearchParams } from 'url';
import fetch from 'node-fetch';

Object.assign(global, { URL, URLSearchParams, fetch });

import glob from 'glob';
import gzipSize from 'gzip-size';
import chalk from 'chalk';
import prettyBytes from 'pretty-bytes';
import { buildFindRenamedFunc, FindRenamed } from './find-renamed';
import {
  getBuildInfo,
  getChanges,
  BuildChanges,
  FileData,
  buildSizePrefix,
} from './compare-travis';

const globP = promisify(glob);
const statP = promisify(stat);
// Travis reports it doesn't support colour. IT IS WRONG.
const alwaysChalk = new chalk.constructor({ level: 4 });

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
    [previousBuildInfo] = await getBuildInfo(user, repo, branch);
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
