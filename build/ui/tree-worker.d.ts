/**
 * @fileoverview
 * Web worker code to parse JSON data from binary_size into data for the UI to
 * display.
 */
export interface Meta {
    components: string[];
    total: number;
    diff_mode: boolean;
}
/**
 * JSON object representing a single symbol.
 */
export interface SymbolEntry {
    /** Name of the symbol. */
    n: string;
    /** Byte size of the symbol, divided by num_aliases. */
    b: number;
    /** Single character string to indicate the symbol type. */
    t: string;
    /**
     * Count value indicating how many symbols this entry
     * represents. Negative value when removed in a diff.
     */
    u?: number;
    /** Bit flags, defaults to 0. */
    f?: number;
    /** Number of aliases */
    a?: number;
}
export interface FileEntry {
    /** Path to the file (source_path). */
    p: string;
    /** Index of the file's component in meta (component_index). */
    c: number;
    /** Symbols belonging to this node. Array of objects. */
    s: SymbolEntry[];
}
