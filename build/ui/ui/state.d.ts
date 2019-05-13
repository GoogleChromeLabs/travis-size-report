import { GetSizeResult, TreeNode } from './shared';
/**
 * @fileoverview
 * Methods for manipulating the state and the DOM of the page
 */
/** Form containing options and filters */
export declare const form: HTMLFormElement;
/** Utilities for working with the DOM */
export declare const dom: {
    /**
     * Create a document fragment from the given nodes
     */
    createFragment(nodes: Iterable<Node>): DocumentFragment;
    /**
     * Removes all the existing children of `parent` and inserts
     * `newChild` in their place
     */
    replace(parent: Node, newChild: Node | null): void;
    /**
     * Builds a text element in a single statement.
     * @param {string} tagName Type of the element, such as "span".
     * @param {string} text Text content for the element.
     * @param {string} [className] Class to apply to the element.
     */
    textElement(tagName: string, text: string, className?: string | undefined): HTMLElement;
};
/** Utilities for working with the state */
export declare const state: Readonly<{
    /**
     * Returns a string from the current query string state.
     * @param {string} key
     * @returns {string | null}
     */
    get(key: string): string | null;
    /**
     * Checks if a key is present in the query string state.
     * @param {string} key
     * @returns {boolean}
     */
    has(key: string): boolean;
    /**
     * Formats the filter state as a string.
     */
    toString(): string;
    /**
     * Saves a key and value into a temporary state not displayed in the URL.
     * @param {string} key
     * @param {string | null} value
     */
    set(key: string, value: string | null): void;
}>;
declare const getIconTemplate: (type: string, readonly?: boolean) => SVGSVGElement, getIconStyle: (type: string) => {
    color: string;
    description: string;
};
declare const getSizeContents: (node: TreeNode) => GetSizeResult, setSizeClasses: (sizeElement: HTMLElement, value: number) => void;
export { getIconTemplate, getIconStyle, getSizeContents, setSizeClasses };
