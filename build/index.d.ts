export declare type FindRenamed = (
/** Path of a file that's missing in the latest build */
filePath: string, 
/** Paths of files that are new in the latest build */
newFiles: string[]) => string | void | Promise<void> | Promise<string>;
export interface SizeReportOptions {
    /** Branch to compare to. Defaults to 'master' */
    branch?: string;
    /**
     * Join together a missing file and a new file which should be considered the same (as in,
     * renamed).
     *
     * Return nothing to indicate `filePath` has been removed from the new build, or return one of the
     * strings in `newFiles` to treat it as a rename.
     *
     * This can be async, returning a promise for a string or undefined.
     */
    findRenamed?: FindRenamed;
}
export default function sizeReport(user: string, repo: string, files: string | string[], { branch, findRenamed }?: SizeReportOptions): Promise<void>;
