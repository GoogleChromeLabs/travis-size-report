/**
 * Configuration file for travis-size-report.
 * This is typically `sizereport.config.js`.
 */
export interface Config {
    /**
     * The username/repo-name
     * @example
     * repo: "GoogleChromeLabs/travis-size-report"
     */
    repo: string;
    /**
     * The glob (or array of globs) of files to include in the report.
     * @example
     * path: 'dist/*'
     */
    path: string | readonly string[];
    buildSizePath: string;
    cdnUrl: string;
    /**
     * By default, a renamed file will look like one file deleted and another created.
     * By writing a findRenamed callback, you can tell travis-size-report that a file was renamed.
     */
    findRenamed?: string | import('./find-renamed').FindRenamed;
}
export declare function getConfig(): Config;
