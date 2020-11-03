import { promisify } from 'util';
import { stat } from 'fs';
import gzipSize from 'gzip-size';
import glob from 'glob';

export interface FileData {
  name: string;
  path: string;
  size: number;
  gzipSize: number;
}

const globP = promisify(glob);
const statP = promisify(stat);

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

export async function getBuildInfo(files: string | readonly string[]) {
  // Get target files
  const filePaths = [];

  for (const glob of files) {
    const matches = await globP(glob, { nodir: true });
    filePaths.push(...matches);
  }

  const uniqueFilePaths = [...new Set(filePaths)];

  // Output the current build sizes for later retrieval.
  return pathsToInfoArray(uniqueFilePaths);
}
