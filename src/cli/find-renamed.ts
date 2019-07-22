import escapeRE from 'escape-string-regexp';

export type FindRenamed = (
  /** Path of a file that's missing in the latest build */
  filePath: string,
  /** Paths of files that are new in the latest build */
  newFiles: string[],
) => string | undefined | PromiseLike<string | undefined>;

const PLACEHOLDER_REGEX = /\\\[(\w+)\\\]/g;
const REPLACEMENTS = {
  extname: '(\\.\\w+)',
  hash: '[a-f0-9]+',
  name: '(.+)',
};
type Placeholder = keyof typeof REPLACEMENTS;

/**
 * Name doesn't start with "./", "/", "../"
 */
function isPlainName(name: string) {
  return !(
    name[0] === '/' ||
    (name[1] === '.' && (name[2] === '/' || (name[2] === '.' && name[3] === '/')))
  );
}

export function validateFindRenamedPattern(pattern: string) {
  if (!isPlainName(pattern)) {
    throw new TypeError(
      `Invalid output pattern "${pattern}, cannot be an absolute or relative path.`,
    );
  }

  escapeRE(pattern).replace(PLACEHOLDER_REGEX, (_match, type) => {
    const replacement = REPLACEMENTS[type as Placeholder];
    if (replacement == undefined) {
      throw new TypeError(`"${type}" is not a valid substitution name`);
    }
    return replacement;
  });
}

/**
 * Creates a findRenamed function based on the given `pattern`.
 *
 * Patterns support the following placeholders:
 * - `[extname]`: The file extension of the asset including a leading dot, e.g. `.css`
 * - `[hash]`: A hash based on the name and content of the asset.
 * - `[name]`: The file name of the asset excluding any extension.
 */
export function buildFindRenamedFunc(pattern: string): FindRenamed {
  validateFindRenamedPattern(pattern);

  // Keep track of which placeholder each regex group corresponds to.
  let i = 1;
  const groups: Placeholder[] = [];

  // Create a regex to extract parts of the path.
  const parts = escapeRE(pattern).replace(PLACEHOLDER_REGEX, (_match, type) => {
    const replacement = REPLACEMENTS[type as Placeholder];
    if (replacement == undefined) {
      throw new TypeError(`"${type}" is not a valid substitution name`);
    }
    groups[i] = type;
    i++;
    return replacement;
  });
  const partsRe = new RegExp(`^${parts}$`);

  return function generatedFindRenamed(path, newPaths) {
    const oldParts = partsRe.exec(path);
    if (!oldParts) return undefined;

    return newPaths.find(newPath => {
      const newParts = partsRe.exec(newPath);
      if (!newParts || newParts.length !== oldParts.length) return false;
      for (let i = 1; i < oldParts.length; i++) {
        if (oldParts[i] !== newParts[i] && groups[i] !== 'hash') return false;
      }
      return true;
    });
  };
}
