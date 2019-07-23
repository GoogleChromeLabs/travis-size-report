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

const extensionsToReplace = new Map([['.gz', ''], ['.map', ''], ['.d.ts', '.js']]);

function addSymbol(entries: Map<string, FileEntry>, filePath: string, symbol: SymbolEntry) {
  let path = filePath;
  for (const [extension, replacement] of extensionsToReplace) {
    const index = path.lastIndexOf(extension);
    if (index > -1) {
      path = path.substring(0, index) + replacement;
    }
  }

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

function transformChanges(changes: BuildChanges): { meta: Meta; entries: Iterable<FileEntry> } {
  const total =
    changes.newItems.length +
    changes.deletedItems.length +
    changes.sameItems.length +
    changes.changedItems.size;
  const meta: Meta = { total, diff_mode: true };

  const entries = new Map<string, FileEntry>();

  for (const data of changes.newItems) {
    addSymbol(entries, data.path, toSymbol(data));
  }
  for (const data of changes.deletedItems) {
    addSymbol(entries, data.path, {
      ...toSymbol(data),
      b: -data.size,
      g: -data.gzipSize,
      u: -1,
    });
  }
  for (const data of changes.sameItems) {
    addSymbol(entries, data.path, {
      ...toSymbol(data),
      b: 0,
      g: 0,
    });
  }
  for (const [oldData, newData] of changes.changedItems) {
    addSymbol(entries, newData.path, {
      ...toSymbol(newData),
      b: newData.size - oldData.size,
      g: newData.gzipSize - oldData.gzipSize,
    });
  }

  return { meta, entries: entries.values() };
}

function transformBuildInfo(buildInfo: FileData[]) {
  const entries = new Map<string, FileEntry>();

  for (const data of buildInfo) {
    addSymbol(entries, data.path, toSymbol(data));
  }

  return { meta: { total: buildInfo.length, diff_mode: false }, entries: entries.values() };
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
    let transformed: { meta: Meta; entries: Iterable<FileEntry> };

    if (this.diffMode) {
      const [currentBuildInfo, previousBuildInfo] = await getBuildInfo(user, repo, this.branch, 2);

      if (!previousBuildInfo) {
        throw new Error(`Couldn't find previous build info`);
      } else if (!currentBuildInfo) {
        throw new Error(`Couldn't find current build info`);
      }

      const buildChanges = await getChanges(previousBuildInfo, currentBuildInfo, this.findRenamed);
      transformed = transformChanges(buildChanges);
    } else {
      const [currentBuildInfo] = await getBuildInfo(user, repo, this.branch, 1);

      if (!currentBuildInfo) {
        throw new Error(`Couldn't find current build info`);
      }

      transformed = transformBuildInfo(currentBuildInfo);
    }

    const { meta, entries } = transformed;
    yield meta;
    yield* entries;
  }
}
