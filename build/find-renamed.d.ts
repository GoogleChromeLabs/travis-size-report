export declare type FindRenamed = (
/** Path of a file that's missing in the latest build */
filePath: string, 
/** Paths of files that are new in the latest build */
newFiles: string[]) => string | undefined | PromiseLike<string | undefined>;
export declare function validateFindRenamedPattern(pattern: string): void;
/**
 * Creates a findRenamed function based on the given `pattern`.
 *
 * Patterns support the following placeholders:
 * - `[extname]`: The file extension of the asset including a leading dot, e.g. `.css`
 * - `[hash]`: A hash based on the name and content of the asset.
 * - `[name]`: The file name of the asset excluding any extension.
 */
export declare function buildFindRenamedFunc(pattern: string): FindRenamed;
