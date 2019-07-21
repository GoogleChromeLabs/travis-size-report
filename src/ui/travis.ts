import { BuildChanges, getBuildInfo, getChanges } from '../cli/compare-travis';
import { FileEntry, Meta } from './tree-worker';

function basename(path: string) {
  return path.substring(path.lastIndexOf('/') + 1);
}

function transformChanges(changes: BuildChanges): { meta: Meta; entries: FileEntry[] } {
  const total =
    changes.newItems.length +
    changes.deletedItems.length +
    changes.sameItems.length +
    changes.changedItems.size;
  const meta = { components: ['N/A'], total, diff_mode: true };

  const entries: FileEntry[] = [];
  for (const data of changes.newItems) {
    entries.push({
      p: data.path,
      c: 0,
      s: [
        {
          n: basename(data.path),
          b: data.size,
          t: _CODE_SYMBOL_TYPE,
          u: 1,
        },
        {
          n: basename(data.path) + '.gz',
          b: data.gzipSize,
          t: _OTHER_SYMBOL_TYPE,
          u: 1,
        },
      ],
    });
  }
  for (const data of changes.deletedItems) {
    entries.push({
      p: data.path,
      c: 0,
      s: [
        {
          n: basename(data.path),
          b: -data.size,
          t: _CODE_SYMBOL_TYPE,
          u: -1,
        },
        {
          n: basename(data.path) + '.gz',
          b: -data.gzipSize,
          t: _OTHER_SYMBOL_TYPE,
          u: -1,
        },
      ],
    });
  }
  for (const data of changes.sameItems) {
    entries.push({
      p: data.path,
      c: 0,
      s: [
        {
          n: basename(data.path),
          b: 0,
          t: _CODE_SYMBOL_TYPE,
          u: 1,
        },
        {
          n: basename(data.path) + '.gz',
          b: 0,
          t: _OTHER_SYMBOL_TYPE,
          u: 1,
        },
      ],
    });
  }
  for (const [oldData, newData] of changes.changedItems) {
    entries.push({
      p: newData.path,
      c: 0,
      s: [
        {
          n: basename(newData.path),
          b: newData.size - oldData.size,
          t: _CODE_SYMBOL_TYPE,
          u: 1,
        },
        {
          n: basename(newData.path) + '.gz',
          b: newData.gzipSize - oldData.gzipSize,
          t: _OTHER_SYMBOL_TYPE,
          u: 1,
        },
      ],
    });
  }

  return { meta, entries };
}

export class TravisFetcher {
  private _input!: [string, string];

  constructor(input: string) {
    this.setInput(input);
  }

  setInput(input: string) {
    this._input = input.split('/') as [string, string];
  }

  async *newlineDelimtedJsonStream() {
    const [user, repo] = this._input;
    const [currentBuildInfo, previousBuildInfo] = await getBuildInfo(user, repo, 'master', 2);

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
