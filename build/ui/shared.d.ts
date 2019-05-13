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
export declare type GetSize = (node: TreeNode, unit: string) => GetSizeResult;
/**
 * Abberivated keys used by FileEntrys in the JSON data file. These must match
 * _COMPACT_*_KEY variables in html_report.py.
 */
export declare const _KEYS: Readonly<{
    COMPONENT_INDEX: "c";
    SOURCE_PATH: "p";
    FILE_SYMBOLS: "s";
    SIZE: "b";
    COUNT: "u";
    FLAGS: "f";
    SYMBOL_NAME: "n";
    NUM_ALIASES: "a";
    TYPE: "t";
}>;
/** Abberivated keys used by FileEntrys in the JSON data file. */
export declare const _FLAGS: Readonly<{
    ANONYMOUS: number;
    STARTUP: number;
    UNLIKELY: number;
    REL: number;
    REL_LOCAL: number;
    GENERATED_SOURCE: number;
    CLONE: number;
    HOT: number;
    COVERAGE: number;
    UNCOMPRESSED: number;
}>;
/**
 * @enum {number} Various byte units and the corresponding amount of bytes
 * that one unit represents.
 */
export declare const _BYTE_UNITS: Readonly<{
    GiB: number;
    MiB: number;
    KiB: number;
    B: number;
}>;
/**
 * Special types used by containers, such as folders and files.
 */
export declare const _CONTAINER_TYPES: {
    DIRECTORY: "D";
    COMPONENT: "C";
    FILE: "F";
    JAVA_CLASS: "J";
};
export declare const _CONTAINER_TYPE_SET: Set<"D" | "C" | "F" | "J">;
/** Type for a code/.text symbol */
export declare const _CODE_SYMBOL_TYPE = "t";
/** Type for a dex method symbol */
export declare const _DEX_METHOD_SYMBOL_TYPE = "m";
/** Type for a non-method dex symbol */
export declare const _DEX_SYMBOL_TYPE = "x";
/** Type for an 'other' symbol */
export declare const _OTHER_SYMBOL_TYPE = "o";
/** Set of all known symbol types. Container types are not included. */
export declare const _SYMBOL_TYPE_SET: Set<string>;
/** Name used by a directory created to hold symbols with no name. */
export declare const _NO_NAME = "(No path)";
/** Key where type is stored in the query string state. */
export declare const _TYPE_STATE_KEY = "type";
export declare const _LOCALE: string | string[];
/**
 * Returns shortName for a tree node.
 */
export declare function shortName(node: TreeNode): string;
/**
 * Iterate through each type in the query string. Types can be expressed as
 * repeats of the same key in the query string ("type=b&type=p") or as a long
 * string with multiple characters ("type=bp").
 * @param typesList All values associated with the "type" key in the
 * query string.
 */
export declare function types(typesList: string[]): IterableIterator<string>;
/**
 * Limit how frequently `func` is called.
 * @template T
 * @param {T & Function} func
 * @param {number} wait Time to wait before func can be called again (ms).
 * @returns {T}
 */
export declare function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T;
/**
 * Returns tree if a symbol has a certain bit flag
 * @param flag Bit flag from `_FLAGS`
 * @param symbolNode
 */
export declare function hasFlag(flag: number, symbolNode: TreeNode): boolean;
export {};
