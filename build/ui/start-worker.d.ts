import { TreeProgress, TreeNode } from './shared';
/**
 * We use a worker to keep large tree creation logic off the UI thread.
 * This class is used to interact with the worker.
 */
declare class TreeWorker {
    private _worker;
    /** ID counter used by `waitForResponse` */
    private _requestId;
    private _loadTreeCallback;
    /**
     * @param {Worker} worker Web worker to wrap
     */
    constructor(worker: Worker);
    _waitForResponse(action: string, data: unknown): Promise<unknown>;
    /**
     * Get data for a node with `idPath`. Loads information about the node and its
     * direct children. Deeper children can be loaded by calling this function
     * again.
     * @param {string} idPath Path of the node to find
     * @returns {Promise<TreeNode | null>}
     */
    openNode(idPath: string): Promise<TreeNode | null>;
    /**
     * Set callback used after `loadTree` is first called.
     * @param callback Called when the worker
     * has some data to display. Complete when `progress` is 1.
     */
    setOnProgressHandler(callback: (data: TreeProgress) => void): void;
    /**
     * Loads the tree data given on a worker thread and replaces the tree view in
     * the UI once complete. Uses query string as state for the options.
     * Use `onProgress` before calling `loadTree`.
     * @param {string} input
     */
    loadTree(input?: string | null): Promise<TreeProgress>;
}
export declare const worker: TreeWorker;
export declare const treeReady: Promise<TreeProgress>;
export {};
