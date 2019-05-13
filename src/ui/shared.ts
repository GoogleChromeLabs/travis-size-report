// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview
 * Constants used by both the UI and Web Worker scripts.
 */

/**
 * Node object used to represent the file tree. Can
 * represent either a container or a symbol.
 */
export interface TreeNode {
  /**
   * Child tree nodes. Null values indicate
   * that there are children, but that they haven't been loaded in yet. Empty
   * arrays indicate this is a leaf node.
   */
  children: TreeNode[] | null;
  /** Parent tree node. null if this is a root node. */
  parent: TreeNode | null;
  /** Full path to this node. */
  idPath: string;
  /** Path to the source containing this symbol. */
  srcPath: string;
  /** OWNERS Component for this symbol. */
  component: string;
  /**
   * The name of the node is include in the idPath.
   * This index indicates where to start to slice the idPath to read the name.
   */
  shortNameIndex: number;
  /** Byte size of this node and its children. */
  size: number;
  /**
   * Type of this node. If this node has children, the string
   * may have a second character to denote the most common child.
   */
  type: string;
  flags: number;
  numAliases: number;
  /**
   * Stats about this
   * node's descendants, organized by symbol type.
   */
  childStats: {
    [type: string]: TreeNodeChildStats;
  };
}

/**
 * Stats about a node's descendants of a certain type.
 */
interface TreeNodeChildStats {
  /** Byte size */
  size: number;
  /** Number of symbols */
  count: number;
  /** Byte size of children that should be highlighted. */
  highlight: number;
}

export interface TreeProgress {
  /** Root node and its direct children. */
  root: TreeNode;
  /** Number from (0-1] to represent percentage. */
  percent: number;
  /**
   * True if we are currently showing the diff of two
   * different size files.
   * */
  diffMode: boolean;
  /**
   * Error message, if an error occurred in the worker.
   * If unset, then there was no error.
   */
  error?: string;
}

export interface GetSizeResult {
  /** Description of the size, shown as hover text */
  description: string;
  /**
   * Abbreviated representation of the size, which can
   * include DOM elements for styling.
   */
  element: Node;
  /** The size number used to create the other strings. */
  value: number;
}

export type GetSize = (node: TreeNode, unit: string) => GetSizeResult;

/**
 * Abberivated keys used by FileEntrys in the JSON data file. These must match
 * _COMPACT_*_KEY variables in html_report.py.
 */
export const _KEYS = Object.freeze({
  COMPONENT_INDEX: 'c' as const,
  SOURCE_PATH: 'p' as const,
  FILE_SYMBOLS: 's' as const,
  SIZE: 'b' as const,
  COUNT: 'u' as const,
  FLAGS: 'f' as const,
  SYMBOL_NAME: 'n' as const,
  NUM_ALIASES: 'a' as const,
  TYPE: 't' as const,
});

/** Abberivated keys used by FileEntrys in the JSON data file. */
export const _FLAGS = Object.freeze({
  ANONYMOUS: 2 ** 0,
  STARTUP: 2 ** 1,
  UNLIKELY: 2 ** 2,
  REL: 2 ** 3,
  REL_LOCAL: 2 ** 4,
  GENERATED_SOURCE: 2 ** 5,
  CLONE: 2 ** 6,
  HOT: 2 ** 7,
  COVERAGE: 2 ** 8,
  UNCOMPRESSED: 2 ** 9,
});

/**
 * @enum {number} Various byte units and the corresponding amount of bytes
 * that one unit represents.
 */
export const _BYTE_UNITS = Object.freeze({
  GiB: 1024 ** 3,
  MiB: 1024 ** 2,
  KiB: 1024 ** 1,
  B: 1024 ** 0,
});

/**
 * Special types used by containers, such as folders and files.
 */
export const _CONTAINER_TYPES = {
  DIRECTORY: 'D' as const,
  COMPONENT: 'C' as const,
  FILE: 'F' as const,
  JAVA_CLASS: 'J' as const,
};
export const _CONTAINER_TYPE_SET = new Set(Object.values(_CONTAINER_TYPES));

/** Type for a code/.text symbol */
export const _CODE_SYMBOL_TYPE = 't';
/** Type for a dex method symbol */
export const _DEX_METHOD_SYMBOL_TYPE = 'm';
/** Type for a non-method dex symbol */
export const _DEX_SYMBOL_TYPE = 'x';
/** Type for an 'other' symbol */
export const _OTHER_SYMBOL_TYPE = 'o';

/** Set of all known symbol types. Container types are not included. */
export const _SYMBOL_TYPE_SET = new Set('bdrtRxmopP');

/** Name used by a directory created to hold symbols with no name. */
export const _NO_NAME = '(No path)';

/** Key where type is stored in the query string state. */
export const _TYPE_STATE_KEY = 'type';

export const _LOCALE = (navigator.languages || navigator.language) as string | string[];

/**
 * Returns shortName for a tree node.
 */
export function shortName(node: TreeNode) {
  return node.idPath.slice(node.shortNameIndex);
}

/**
 * Iterate through each type in the query string. Types can be expressed as
 * repeats of the same key in the query string ("type=b&type=p") or as a long
 * string with multiple characters ("type=bp").
 * @param typesList All values associated with the "type" key in the
 * query string.
 */
export function* types(typesList: string[]) {
  for (const typeOrTypes of typesList) {
    for (const typeChar of typeOrTypes) {
      yield typeChar;
    }
  }
}

/**
 * Limit how frequently `func` is called.
 * @template T
 * @param {T & Function} func
 * @param {number} wait Time to wait before func can be called again (ms).
 * @returns {T}
 */
export function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeoutId: number;
  function debounced(...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = self.setTimeout(() => func(...args), wait);
  }
  return debounced as T;
}

/**
 * Returns tree if a symbol has a certain bit flag
 * @param flag Bit flag from `_FLAGS`
 * @param symbolNode
 */
export function hasFlag(flag: number, symbolNode: TreeNode) {
  return (symbolNode.flags & flag) === flag;
}
