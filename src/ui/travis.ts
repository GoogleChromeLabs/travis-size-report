import { BuildChanges, getBuildInfo, getChanges } from '../cli/compare-travis';
import { FileEntry, Meta } from './tree-worker';
export { FileData } from '../cli/compare-travis';

function basename(path: string) {
  return path.substring(path.lastIndexOf('/') + 1);
}

function extname(path: string) {
  return path.substring(path.lastIndexOf('.') + 1);
}

function transformChanges(changes: BuildChanges): { meta: Meta; entries: FileEntry[] } {
  const total =
    changes.newItems.length +
    changes.deletedItems.length +
    changes.sameItems.length +
    changes.changedItems.size;
  const meta: Meta = { total, diff_mode: true };

  const entries: FileEntry[] = [];
  for (const data of changes.newItems) {
    entries.push({
      p: data.path,
      s: [
        {
          n: basename(data.path),
          b: data.size,
          g: data.gzipSize,
          t: extname(data.path),
          u: 1,
        },
      ],
    });
  }
  for (const data of changes.deletedItems) {
    entries.push({
      p: data.path,
      s: [
        {
          n: basename(data.path),
          b: -data.size,
          g: -data.gzipSize,
          t: extname(data.path),
          u: -1,
        },
      ],
    });
  }
  for (const data of changes.sameItems) {
    entries.push({
      p: data.path,
      s: [
        {
          n: basename(data.path),
          b: 0,
          g: 0,
          t: extname(data.path),
          u: 1,
        },
      ],
    });
  }
  for (const [oldData, newData] of changes.changedItems) {
    entries.push({
      p: newData.path,
      s: [
        {
          n: basename(newData.path),
          b: newData.size - oldData.size,
          g: newData.gzipSize - oldData.gzipSize,
          t: extname(newData.path),
          u: 1,
        },
      ],
    });
  }

  return { meta, entries };
}

export class TravisFetcher {
  private user?: string;
  private repo?: string;
  private branch = 'master';

  constructor(input: string) {
    this.setInput(input);
  }

  setInput(input: string) {
    const parts = input.split('/');
    if (parts.length < 2) {
      throw new TypeError(`Invalid input. Must be in format user/repo.`);
    } else {
      this.user = parts[0];
      this.repo = parts[1];
      if (parts.length >= 3) {
        this.branch = parts.slice(2).join('/');
      } else {
        this.branch = 'master';
      }
    }
  }

  async *newlineDelimtedJsonStream() {
    const [currentBuildInfo, previousBuildInfo] = await getBuildInfo(
      this.user!,
      this.repo!,
      this.branch,
      2,
    );

    if (!previousBuildInfo) {
      throw new Error(`Couldn't find previous build info`);
    } else if (!currentBuildInfo) {
      throw new Error(`Couldn't find current build info`);
    }

    const buildChanges = await getChanges(previousBuildInfo, currentBuildInfo);
    const { meta, entries } = transformChanges(buildChanges);

    yield meta;
    yield* entries;
  }
}
