// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const _innerWorker = new Worker('build/tree-worker.js');

/**
 * We use a worker to keep large tree creation logic off the UI thread.
 * This class is used to interact with the worker.
 */
class TreeWorker {
  private _worker: Worker;
  /** ID counter used by `waitForResponse` */
  private _requestId = 1;
  private _loadTreeCallback: ((data: TreeProgress) => void) | null = null;

  /**
   * @param {Worker} worker Web worker to wrap
   */
  constructor(worker: Worker) {
    this._worker = worker;

    this._worker.addEventListener('message', event => {
      if (this._loadTreeCallback && event.data.id === 0) {
        this._loadTreeCallback(event.data);
      }
    });
  }

  _waitForResponse(action: string, data: unknown) {
    const id = ++this._requestId;
    return new Promise<unknown>((resolve, reject) => {
      const handleResponse = (event: MessageEvent) => {
        if (event.data.id === id) {
          this._worker.removeEventListener('message', handleResponse);
          if (event.data.error) {
            reject(event.data.error);
          } else {
            resolve(event.data.result);
          }
        }
      };

      this._worker.addEventListener('message', handleResponse);
      this._worker.postMessage({ id, action, data });
    });
  }

  /**
   * Get data for a node with `idPath`. Loads information about the node and its
   * direct children. Deeper children can be loaded by calling this function
   * again.
   * @param {string} idPath Path of the node to find
   * @returns {Promise<TreeNode | null>}
   */
  openNode(idPath: string): Promise<TreeNode | null> {
    return this._waitForResponse('open', idPath) as Promise<TreeNode | null>;
  }

  /**
   * Set callback used after `loadTree` is first called.
   * @param callback Called when the worker
   * has some data to display. Complete when `progress` is 1.
   */
  setOnProgressHandler(callback: (data: TreeProgress) => void) {
    this._loadTreeCallback = callback;
  }

  /**
   * Loads the tree data given on a worker thread and replaces the tree view in
   * the UI once complete. Uses query string as state for the options.
   * Use `onProgress` before calling `loadTree`.
   * @param {string} input
   */
  loadTree(): Promise<TreeProgress> {
    return this._waitForResponse('load', {
      options: location.search.slice(1),
    }) as Promise<TreeProgress>;
  }
}

export const worker = new TreeWorker(_innerWorker);
// Kick off the worker ASAP so it can start parsing data faster.
// Subsequent calls will just use a worker locally.
export const treeReady = worker.loadTree();
