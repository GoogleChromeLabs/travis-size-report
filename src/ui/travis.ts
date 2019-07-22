import { BuildChanges, getBuildInfo, getChanges } from '../cli/compare-travis';
import { FileEntry, Meta } from './tree-worker';
import { FindRenamed, buildFindRenamedFunc } from '../cli/find-renamed';
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
  repo?: string;
  branch = 'master';
  private findRenamed?: FindRenamed;

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
