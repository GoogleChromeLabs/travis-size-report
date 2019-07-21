import { FindRenamed } from './find-renamed';

export interface FileData {
  path: string;
  size: number;
  gzipSize: number;
}

export const buildSizePrefix = '=== BUILD SIZES: ';
const buildSizePrefixRe = new RegExp(`^${buildSizePrefix}(.+)$`, 'm');

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

function fetchTravisBuildInfo(user: string, repo: string, branch: string, limit: number = 1) {
  return fetchTravis(`/repo/${encodeURIComponent(`${user}/${repo}`)}/builds`, {
    'branch.name': branch,
    state: 'passed',
    limit: limit.toString(),
    event_type: 'push',
  }).then(r => r.json());
}

function getFileDataFromTravis(
  builds: { jobs: { '@href': string }[] }[],
): Promise<(FileData[] | undefined)[]> {
  return Promise.all(
    builds.map(async build => {
      const jobUrl = build.jobs[0]['@href'];
      const response = await fetchTravis(jobUrl + '/log.txt');
      const log = await response.text();
      const reResult = buildSizePrefixRe.exec(log);

      if (!reResult) return undefined;
      return JSON.parse(reResult[1]);
    }),
  );
}

/**
 * Scrape Travis for the previous build info.
 */
export async function getBuildInfo(
  user: string,
  repo: string,
  branch: string,
  limit = 1,
): Promise<(FileData[] | undefined)[]> {
  let fileData;
  try {
    const buildData = await fetchTravisBuildInfo(user, repo, branch, limit);
    fileData = await getFileDataFromTravis(buildData.builds);
  } catch (err) {
    throw new Error(`Couldn't parse build info`);
  }
  return fileData;
}

export interface BuildChanges {
  deletedItems: FileData[];
  newItems: FileData[];
  sameItems: FileData[];
  changedItems: Map<FileData, FileData>;
}

/**
 * Generate an array that represents the difference between builds.
 * Returns an array of { beforeName, afterName, beforeSize, afterSize }.
 * Sizes are gzipped size.
 * Before/after properties are missing if resource isn't in the previous/new build.
 */
export async function getChanges(
  previousBuildInfo: FileData[],
  buildInfo: FileData[],
  findRenamed?: FindRenamed,
): Promise<BuildChanges> {
  const deletedItems: FileData[] = [];
  const sameItems: FileData[] = [];
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
    } else {
      sameItems.push(newEntry);
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

  return { newItems, deletedItems, sameItems, changedItems };
}
