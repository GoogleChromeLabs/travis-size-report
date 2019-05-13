import { FileEntry, Meta } from './tree-worker';
export declare class TravisFetcher {
    private _input;
    constructor(input: string);
    setInput(input: string): void;
    newlineDelimtedJsonStream(): AsyncIterableIterator<Meta | FileEntry>;
}
