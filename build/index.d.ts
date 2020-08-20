import { FindRenamed } from './find-renamed';
export interface SizeReportOptions {
    /**
     * Join together a missing file and a new file which should be considered the same (as in,
     * renamed).
     *
     * Return nothing to indicate `filePath` has been removed from the new build, or return one of the
     * strings in `newFiles` to treat it as a rename.
     *
     * This can be async, returning a promise for a string or undefined.
     */
    findRenamed?: string | FindRenamed;
}
export default function sizeReport(user: string, repo: string, files: string | readonly string[], cdnUrl: string, { findRenamed }?: SizeReportOptions): Promise<void>;
