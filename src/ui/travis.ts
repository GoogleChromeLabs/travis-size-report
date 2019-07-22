import { BuildChanges, getBuildInfo, getChanges, FileData } from '../cli/compare-travis';
import { FileEntry, Meta, SymbolEntry } from './tree-worker';
import { FindRenamed, buildFindRenamedFunc } from '../cli/find-renamed';
export { FileData } from '../cli/compare-travis';

function basename(path: string) {
  return path.substring(path.lastIndexOf('/') + 1);
}

function extname(path: string) {
  return path.substring(path.lastIndexOf('.') + 1);
}

function toSymbol(data: FileData) {
  return {
    n: basename(data.path),
    b: data.size,
    g: data.gzipSize,
    t: extname(data.path),
    u: 1,
  };
}

const extensionsToMerge = ['.gz', '.map', '.d.ts'];

function transformChanges(changes: BuildChanges): { meta: Meta; entries: Iterable<FileEntry> } {
  const total =
    changes.newItems.length +
    changes.deletedItems.length +
    changes.sameItems.length +
    changes.changedItems.size;
  const meta: Meta = { total, diff_mode: true };

  const entries = new Map<string, FileEntry>();
  function addSymbol(symbol: SymbolEntry) {
    const path = extensionsToMerge.reduce((path, extension) => {
      const index = path.lastIndexOf(extension);
      if (index > -1) {
        return path.substring(0, index);
      } else {
        return path;
      }
    }, symbol[_KEYS.SYMBOL_NAME]);

    if (entries.has(path)) {
      const entry = entries.get(path)!;
      entry[_KEYS.FILE_SYMBOLS].push(symbol);
    } else {
      entries.set(path, {
        p: path,
        s: [symbol],
      });
    }
  }

  for (const data of changes.newItems) {
    addSymbol(toSymbol(data));
  }
  for (const data of changes.deletedItems) {
    addSymbol({
      ...toSymbol(data),
      b: -data.size,
      g: -data.gzipSize,
      u: -1,
    });
  }
  for (const data of changes.sameItems) {
    addSymbol({
      ...toSymbol(data),
      b: 0,
      g: 0,
    });
  }
  for (const [oldData, newData] of changes.changedItems) {
    addSymbol({
      ...toSymbol(newData),
      b: newData.size - oldData.size,
      g: newData.gzipSize - oldData.gzipSize,
    });
  }

  return { meta, entries: entries.values() };
}

export class TravisFetcher {
  diffMode = true;
  repo?: string;
  branch = 'master';
  private findRenamed?: FindRenamed;

  setDiffMode(diffMode: boolean) {
    this.diffMode = diffMode;
  }

  setRepo(repo: string | null) {
    this.repo = repo || 'GoogleChromeLabs/travis-size-report';
  }

  setBranch(branch: string | null) {
    this.branch = branch || 'master';
  }

  setFindRenamed(pattern: string | null) {
    this.findRenamed = pattern ? buildFindRenamedFunc(pattern) : undefined;
  }

  async *newlineDelimtedJsonStream() {
    const [user, repo] = this.repo!.split('/');
    const [currentBuildInfo, previousBuildInfo] = await getBuildInfo(user, repo, this.branch, 2);

    if (!previousBuildInfo) {
      throw new Error(`Couldn't find previous build info`);
    } else if (!currentBuildInfo) {
      throw new Error(`Couldn't find current build info`);
    }

    const buildChanges = await getChanges(previousBuildInfo, currentBuildInfo, this.findRenamed);
    const { meta, entries } = transformChanges(buildChanges);

    yield meta;
    yield* entries;
  }
}
