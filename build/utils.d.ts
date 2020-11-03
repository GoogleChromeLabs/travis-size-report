export interface FileData {
    name: string;
    path: string;
    size: number;
    gzipSize: number;
}
export declare function getBuildInfo(files: string | readonly string[]): Promise<FileData[]>;
