import { FindRenamed } from './find-renamed';
export interface FileData {
    path: string;
    size: number;
    gzipSize: number;
}
export declare const buildSizePrefix = "=== BUILD SIZES: ";
/**
 * Scrape Travis for the previous build info.
 */
export declare function getBuildInfo(user: string, repo: string, branch: string, limit?: number): Promise<(FileData[] | undefined)[]>;
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
export declare function getChanges(previousBuildInfo: FileData[], buildInfo: FileData[], findRenamed?: FindRenamed): Promise<BuildChanges>;
