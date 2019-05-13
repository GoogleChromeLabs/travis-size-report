// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Abberivated keys used by FileEntrys in the JSON data file. These must match
 * _COMPACT_*_KEY variables in html_report.py.
 */
const _KEYS = Object.freeze({
    COMPONENT_INDEX: 'c',
    SOURCE_PATH: 'p',
    FILE_SYMBOLS: 's',
    SIZE: 'b',
    COUNT: 'u',
    FLAGS: 'f',
    SYMBOL_NAME: 'n',
    NUM_ALIASES: 'a',
    TYPE: 't',
});
/** Abberivated keys used by FileEntrys in the JSON data file. */
const _FLAGS = Object.freeze({
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
const _BYTE_UNITS = Object.freeze({
    GiB: 1024 ** 3,
    MiB: 1024 ** 2,
    KiB: 1024 ** 1,
    B: 1024 ** 0,
});
/**
 * Special types used by containers, such as folders and files.
 */
const _CONTAINER_TYPES = {
    DIRECTORY: 'D',
    COMPONENT: 'C',
    FILE: 'F',
    JAVA_CLASS: 'J',
};
const _CONTAINER_TYPE_SET = new Set(Object.values(_CONTAINER_TYPES));
/** Type for a code/.text symbol */
const _CODE_SYMBOL_TYPE = 't';
/** Type for a dex method symbol */
const _DEX_METHOD_SYMBOL_TYPE = 'm';
/** Type for a non-method dex symbol */
const _DEX_SYMBOL_TYPE = 'x';
/** Type for an 'other' symbol */
const _OTHER_SYMBOL_TYPE = 'o';
/** Set of all known symbol types. Container types are not included. */
const _SYMBOL_TYPE_SET = new Set('bdrtRxmopP');
/** Name used by a directory created to hold symbols with no name. */
const _NO_NAME = '(No path)';
/** Key where type is stored in the query string state. */
const _TYPE_STATE_KEY = 'type';
const _LOCALE = (navigator.languages || navigator.language);
/**
 * Returns shortName for a tree node.
 */
function shortName(node) {
    return node.idPath.slice(node.shortNameIndex);
}
/**
 * Iterate through each type in the query string. Types can be expressed as
 * repeats of the same key in the query string ("type=b&type=p") or as a long
 * string with multiple characters ("type=bp").
 * @param typesList All values associated with the "type" key in the
 * query string.
 */
function* types(typesList) {
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
function debounce(func, wait) {
    let timeoutId;
    function debounced(...args) {
        clearTimeout(timeoutId);
        timeoutId = self.setTimeout(() => func(...args), wait);
    }
    return debounced;
}
/**
 * Returns tree if a symbol has a certain bit flag
 * @param flag Bit flag from `_FLAGS`
 * @param symbolNode
 */
function hasFlag(flag, symbolNode) {
    return (symbolNode.flags & flag) === flag;
}

const buildSizePrefix = '=== BUILD SIZES: ';
const buildSizePrefixRe = new RegExp(`^${buildSizePrefix}(.+)$`, 'm');
function fetchTravis(path, searchParams = {}) {
    const url = new URL(path, 'https://api.travis-ci.org');
    url.search = new URLSearchParams(searchParams).toString();
    return fetch(url.href, {
        headers: { 'Travis-API-Version': '3' },
    });
}
function fetchTravisBuildInfo(user, repo, branch, limit = 1) {
    return fetchTravis(`/repo/${encodeURIComponent(`${user}/${repo}`)}/builds`, {
        'branch.name': branch,
        state: 'passed',
        limit: limit.toString(),
        event_type: 'push',
    }).then(r => r.json());
}
function getFileDataFromTravis(builds) {
    return Promise.all(builds.map(async (build) => {
        const jobUrl = build.jobs[0]['@href'];
        const response = await fetchTravis(jobUrl + '/log.txt');
        const log = await response.text();
        const reResult = buildSizePrefixRe.exec(log);
        if (!reResult)
            return undefined;
        return JSON.parse(reResult[1]);
    }));
}
/**
 * Scrape Travis for the previous build info.
 */
async function getBuildInfo(user, repo, branch, limit = 1) {
    let fileData;
    try {
        const buildData = await fetchTravisBuildInfo(user, repo, branch, limit);
        fileData = await getFileDataFromTravis(buildData.builds);
    }
    catch (err) {
        throw new Error(`Couldn't parse build info`);
    }
    return fileData;
}
/**
 * Generate an array that represents the difference between builds.
 * Returns an array of { beforeName, afterName, beforeSize, afterSize }.
 * Sizes are gzipped size.
 * Before/after properties are missing if resource isn't in the previous/new build.
 */
async function getChanges(previousBuildInfo, buildInfo, findRenamed) {
    const deletedItems = [];
    const sameItems = [];
    const changedItems = new Map();
    const matchedNewEntries = new Set();
    for (const oldEntry of previousBuildInfo) {
        const newEntry = buildInfo.find(entry => entry.path === oldEntry.path);
        if (!newEntry) {
            deletedItems.push(oldEntry);
            continue;
        }
        matchedNewEntries.add(newEntry);
        if (oldEntry.gzipSize !== newEntry.gzipSize) {
            changedItems.set(oldEntry, newEntry);
        }
        else {
            sameItems.push(newEntry);
        }
    }
    const newItems = [];
    // Look for entries that are only in the new build.
    for (const newEntry of buildInfo) {
        if (matchedNewEntries.has(newEntry))
            continue;
        newItems.push(newEntry);
    }
    // Figure out renamed files.
    if (findRenamed) {
        const originalDeletedItems = deletedItems.slice();
        const newPaths = newItems.map(i => i.path);
        for (const deletedItem of originalDeletedItems) {
            const result = await findRenamed(deletedItem.path, newPaths);
            if (!result)
                continue;
            if (!newPaths.includes(result)) {
                throw Error(`findRenamed: File isn't part of the new build: ${result}`);
            }
            // Remove items from newPaths, deletedItems and newItems.
            // Add them to mappedItems.
            newPaths.splice(newPaths.indexOf(result), 1);
            deletedItems.splice(deletedItems.indexOf(deletedItem), 1);
            const newItemIndex = newItems.findIndex(i => i.path === result);
            changedItems.set(deletedItem, newItems[newItemIndex]);
            newItems.splice(newItemIndex, 1);
        }
    }
    return { newItems, deletedItems, sameItems, changedItems };
}

function basename(path) {
    return path.substring(path.lastIndexOf('/') + 1);
}
function transformChanges(changes) {
    const total = changes.newItems.length +
        changes.deletedItems.length +
        changes.sameItems.length +
        changes.changedItems.size;
    const meta = { components: ['N/A'], total, diff_mode: true };
    /** @type {FileEntry[]} */
    const entries = [];
    for (const data of changes.newItems) {
        entries.push({
            p: data.path,
            c: 0,
            s: [
                {
                    n: basename(data.path),
                    b: data.size,
                    t: _CODE_SYMBOL_TYPE,
                    u: 1,
                },
                {
                    n: basename(data.path) + '.gz',
                    b: data.gzipSize,
                    t: _OTHER_SYMBOL_TYPE,
                    u: 1,
                },
            ],
        });
    }
    for (const data of changes.deletedItems) {
        entries.push({
            p: data.path,
            c: 0,
            s: [
                {
                    n: basename(data.path),
                    b: -data.size,
                    t: _CODE_SYMBOL_TYPE,
                    u: -1,
                },
                {
                    n: basename(data.path) + '.gz',
                    b: -data.gzipSize,
                    t: _OTHER_SYMBOL_TYPE,
                    u: -1,
                },
            ],
        });
    }
    for (const data of changes.sameItems) {
        entries.push({
            p: data.path,
            c: 0,
            s: [
                {
                    n: basename(data.path),
                    b: 0,
                    t: _CODE_SYMBOL_TYPE,
                    u: 1,
                },
                {
                    n: basename(data.path) + '.gz',
                    b: 0,
                    t: _OTHER_SYMBOL_TYPE,
                    u: 1,
                },
            ],
        });
    }
    for (const [oldData, newData] of changes.changedItems) {
        entries.push({
            p: newData.path,
            c: 0,
            s: [
                {
                    n: basename(newData.path),
                    b: newData.size - oldData.size,
                    t: _CODE_SYMBOL_TYPE,
                    u: 1,
                },
                {
                    n: basename(newData.path) + '.gz',
                    b: newData.gzipSize - oldData.gzipSize,
                    t: _OTHER_SYMBOL_TYPE,
                    u: 1,
                },
            ],
        });
    }
    return { meta, entries };
}
class TravisFetcher {
    constructor(input) {
        this.setInput(input);
    }
    setInput(input) {
        this._input = input.split('/');
    }
    async *newlineDelimtedJsonStream() {
        const [user, repo] = this._input;
        const [currentBuildInfo, previousBuildInfo] = await getBuildInfo(user, repo, 'master', 2);
        if (!previousBuildInfo) {
            throw new Error(`Couldn't find previous build info`);
        }
        else if (!currentBuildInfo) {
            throw new Error(`Couldn't find current build info`);
        }
        const buildChanges = await getChanges(previousBuildInfo, currentBuildInfo);
        const { meta, entries } = transformChanges(buildChanges);
        yield meta;
        yield* entries;
    }
}

// Copyright 2018 The Chromium Authors. All rights reserved.
const _PATH_SEP = '/';
const _NAMES_TO_FLAGS = Object.freeze({
    hot: _FLAGS.HOT,
    generated: _FLAGS.GENERATED_SOURCE,
    coverage: _FLAGS.COVERAGE,
    uncompressed: _FLAGS.UNCOMPRESSED,
});
function getSourcePath(fileEntry) {
    return fileEntry[_KEYS.SOURCE_PATH];
}
function getComponent(meta, fileEntry) {
    return meta.components[fileEntry[_KEYS.COMPONENT_INDEX]];
}
/**
 * Find the last index of either '/' or `sep` in the given path.
 */
function lastIndexOf(path, sep) {
    if (sep === _PATH_SEP) {
        return path.lastIndexOf(_PATH_SEP);
    }
    else {
        return Math.max(path.lastIndexOf(sep), path.lastIndexOf(_PATH_SEP));
    }
}
/**
 * Return the dirname of the pathname 'path'. In a file path, this is the
 * full path of its folder.
 * @param path Path to find dirname of.
 * @param sep Path seperator, such as '/'.
 */
function dirname(path, sep) {
    return path.substring(0, lastIndexOf(path, sep));
}
/**
 * Compare two nodes for sorting. Used in sortTree.
 */
function _compareFunc(a, b) {
    return Math.abs(b.size) - Math.abs(a.size);
}
/**
 * Make a node with some default arguments
 * @param options Values to use for the node. If a value is
 * omitted, a default will be used instead.
 */
function createNode(options) {
    const { idPath, srcPath, component, type, shortNameIndex, size = 0, flags = 0, numAliases = 1, childStats = {}, } = options;
    return {
        children: [],
        parent: null,
        idPath,
        srcPath: srcPath,
        component: component,
        type,
        shortNameIndex,
        size,
        flags,
        numAliases,
        childStats,
    };
}
/**
 * Class used to build a tree from a list of symbol objects.
 * Add each file node using `addFileEntry()`, then call `build()` to finalize
 * the tree and return the root node. The in-progress tree can be obtained from
 * the `rootNode` property.
 */
class TreeBuilder {
    /**
     * @param {object} options
     * @param {(fileEntry: FileEntry) => string} options.getPath Called to get the
     * id path of a symbol's file entry.
     * @param {(symbolNode: TreeNode) => boolean} options.filterTest Called to see
     * if a symbol should be included. If a symbol fails the test, it will not be
     * attached to the tree.
     * @param {(symbolNode: TreeNode) => boolean} options.highlightTest Called to
     * see if a symbol should be highlighted.
     * @param {string} options.sep Path seperator used to find parent names.
     * @param {Meta} options.meta Metadata associated with this tree.
     */
    constructor(options) {
        /** Cache for directory nodes */
        this._parents = new Map();
        this._getPath = options.getPath;
        this._filterTest = options.filterTest;
        this._highlightTest = options.highlightTest;
        this._sep = options.sep || _PATH_SEP;
        this._meta = options.meta;
        // srcPath and component don't make sense for the root node.
        this.rootNode = createNode({
            idPath: this._sep,
            shortNameIndex: 0,
            type: this._containerType(this._sep),
        });
        /**
         * Regex used to split the `idPath` when finding nodes. Equivalent to
         * one of: "/" or |sep|
         */
        this._splitter = new RegExp(`[/${this._sep}]`);
    }
    /**
     * Link a node to a new parent. Will go up the tree to update parent sizes to
     * include the new child.
     * @param {TreeNode} node Child node.
     * @param {TreeNode} directParent New parent node.
     */
    _attachToParent(node, directParent) {
        // Link the nodes together
        directParent.children.push(node);
        node.parent = directParent;
        const additionalSize = node.size;
        const additionalStats = Object.entries(node.childStats);
        const additionalFlags = node.flags;
        // Update the size and childStats of all ancestors
        while (node.parent != null) {
            const { parent } = node;
            // Track the size of `lastBiggestType` for comparisons.
            let [containerType, lastBiggestType] = parent.type;
            let lastBiggestSize = 0;
            const lastBiggestStats = parent.childStats[lastBiggestType];
            if (lastBiggestStats) {
                lastBiggestSize = lastBiggestStats.size;
            }
            for (const [type, stat] of additionalStats) {
                let parentStat = parent.childStats[type];
                if (parentStat == null) {
                    parentStat = { size: 0, count: 0, highlight: 0 };
                    parent.childStats[type] = parentStat;
                }
                parentStat.size += stat.size;
                parentStat.count += stat.count;
                parentStat.highlight += stat.highlight;
                const absSize = Math.abs(parentStat.size);
                if (absSize > lastBiggestSize) {
                    lastBiggestType = type;
                    lastBiggestSize = absSize;
                }
            }
            parent.type = `${containerType}${lastBiggestType}`;
            parent.size += additionalSize;
            parent.flags |= additionalFlags;
            node = parent;
        }
    }
    /**
     * Merges dex method symbols such as "Controller#get" and "Controller#set"
     * into containers, based on the class of the dex methods.
     * @param {TreeNode} node
     */
    _joinDexMethodClasses(node) {
        const isFileNode = node.type[0] === _CONTAINER_TYPES.FILE;
        const hasDex = node.childStats[_DEX_SYMBOL_TYPE] || node.childStats[_DEX_METHOD_SYMBOL_TYPE];
        if (!isFileNode || !hasDex || !node.children)
            return node;
        /** @type {Map<string, TreeNode>} */
        const javaClassContainers = new Map();
        /** @type {TreeNode[]} */
        const otherSymbols = [];
        // Place all dex symbols into buckets
        for (const childNode of node.children) {
            // Java classes are denoted with a "#", such as "LogoView#onDraw"
            // Except for some older .ndjson files, which didn't do this for fields.
            const splitIndex = childNode.idPath.lastIndexOf('#');
            // No return type / field type means it's a class node.
            const isClassNode = childNode.idPath.indexOf(' ', childNode.shortNameIndex) == -1;
            const hasClassPrefix = isClassNode || splitIndex != -1;
            if (hasClassPrefix) {
                // Get the idPath of the class
                let classIdPath = splitIndex == -1 ? childNode.idPath : childNode.idPath.slice(0, splitIndex);
                // Strip package from the node name for classes in .java files since the
                // directory tree already shows it.
                let shortNameIndex = childNode.shortNameIndex;
                const javaIdx = childNode.idPath.indexOf('.java:');
                if (javaIdx != -1) {
                    const dotIdx = classIdPath.lastIndexOf('.');
                    if (dotIdx > javaIdx) {
                        shortNameIndex += dotIdx - (javaIdx + 6) + 1;
                    }
                }
                let classNode = javaClassContainers.get(classIdPath);
                if (!classNode) {
                    classNode = createNode({
                        idPath: classIdPath,
                        srcPath: node.srcPath,
                        component: node.component,
                        shortNameIndex: shortNameIndex,
                        type: _CONTAINER_TYPES.JAVA_CLASS,
                    });
                    javaClassContainers.set(classIdPath, classNode);
                }
                // Adjust the dex method's short name so it starts after the "#"
                if (splitIndex != -1) {
                    childNode.shortNameIndex = splitIndex + 1;
                }
                this._attachToParent(childNode, classNode);
            }
            else {
                otherSymbols.push(childNode);
            }
        }
        node.children = otherSymbols;
        for (const containerNode of javaClassContainers.values()) {
            // Delay setting the parent until here so that `_attachToParent`
            // doesn't add method stats twice
            containerNode.parent = node;
            node.children.push(containerNode);
        }
        return node;
    }
    /**
     * Formats a tree node by removing references to its desendants and ancestors.
     * This reduces how much data is sent to the UI thread at once. For large
     * trees, serialization and deserialization of the entire tree can take ~7s.
     *
     * Only children up to `depth` will be kept, and deeper children will be
     * replaced with `null` to indicate that there were children by they were
     * removed.
     *
     * Leaves with no children will always have an empty children array.
     * If a tree has only 1 child, it is kept as the UI will expand chains of
     * single children in the tree.
     *
     * Additionally sorts the formatted portion of the tree.
     * @param {TreeNode} node Node to format
     * @param {number} depth How many levels of children to keep.
     * @returns {TreeNode}
     */
    formatNode(node, depth = 1) {
        const childDepth = depth - 1;
        // `null` represents that the children have not been loaded yet
        let children = null;
        if (depth > 0 || node.children.length <= 1) {
            // If depth is larger than 0, include the children.
            // If there are 0 children, include the empty array to indicate the node
            // is a leaf.
            // If there is 1 child, include it so the UI doesn't need to make a
            // roundtrip in order to expand the chain.
            children = node.children.map(n => this.formatNode(n, childDepth)).sort(_compareFunc);
        }
        return this._joinDexMethodClasses(Object.assign({}, node, {
            children,
            parent: null,
        }));
    }
    /**
     * Returns the container type for a parent node.
     * @param {string} childIdPath
     * @private
     */
    _containerType(childIdPath) {
        const useAlternateType = childIdPath.lastIndexOf(this._sep) > childIdPath.lastIndexOf(_PATH_SEP);
        if (useAlternateType) {
            return _CONTAINER_TYPES.COMPONENT;
        }
        else {
            return _CONTAINER_TYPES.DIRECTORY;
        }
    }
    /**
     * Helper to return the parent of the given node. The parent is determined
     * based in the idPath and the path seperator. If the parent doesn't yet
     * exist, one is created and stored in the parents map.
     * @param {TreeNode} childNode
     * @private
     */
    _getOrMakeParentNode(childNode) {
        // Get idPath of this node's parent.
        let parentPath;
        if (childNode.idPath === '')
            parentPath = _NO_NAME;
        else
            parentPath = dirname(childNode.idPath, this._sep);
        // check if parent exists
        let parentNode;
        if (parentPath === '') {
            // parent is root node if dirname is ''
            parentNode = this.rootNode;
        }
        else {
            // get parent from cache if it exists, otherwise create it
            parentNode = this._parents.get(parentPath);
            if (parentNode == null) {
                // srcPath and component are not available for parent nodes, since they
                // are stored alongside FileEntry. We could extract srcPath from idPath,
                // but it doesn't really add enough value to warrent doing so.
                parentNode = createNode({
                    idPath: parentPath,
                    shortNameIndex: lastIndexOf(parentPath, this._sep) + 1,
                    type: this._containerType(childNode.idPath),
                });
                this._parents.set(parentPath, parentNode);
            }
        }
        // attach node to the newly found parent
        this._attachToParent(childNode, parentNode);
        return parentNode;
    }
    /**
     * Iterate through every file node generated by size report. Each node includes
     * symbols that belong to that file. Create a tree node for each file with
     * tree nodes for that file's symbols attached. Afterwards attach that node to
     * its parent directory node, or create it if missing.
     * @param {FileEntry} fileEntry File entry from data file
     * @param {boolean} diffMode Whether diff mode is in effect.
     */
    addFileEntry(fileEntry, diffMode) {
        const idPath = this._getPath(fileEntry);
        const srcPath = getSourcePath(fileEntry);
        const component = getComponent(this._meta, fileEntry);
        // make node for this
        const fileNode = createNode({
            idPath,
            srcPath,
            component,
            shortNameIndex: lastIndexOf(idPath, this._sep) + 1,
            type: _CONTAINER_TYPES.FILE,
        });
        const defaultCount = diffMode ? 0 : 1;
        // build child nodes for this file's symbols and attach to self
        for (const symbol of fileEntry[_KEYS.FILE_SYMBOLS]) {
            const size = symbol[_KEYS.SIZE];
            const type = symbol[_KEYS.TYPE];
            const count = (_KEYS.COUNT in symbol ? symbol[_KEYS.COUNT] : defaultCount);
            const flags = _KEYS.FLAGS in symbol ? symbol[_KEYS.FLAGS] : 0;
            const numAliases = _KEYS.NUM_ALIASES in symbol ? symbol[_KEYS.NUM_ALIASES] : 1;
            const symbolNode = createNode({
                // Join file path to symbol name with a ":"
                idPath: `${idPath}:${symbol[_KEYS.SYMBOL_NAME]}`,
                srcPath,
                component,
                shortNameIndex: idPath.length + 1,
                size,
                type,
                flags,
                numAliases,
                childStats: {
                    [type]: {
                        size,
                        count,
                        highlight: 0,
                    },
                },
            });
            if (this._highlightTest(symbolNode)) {
                symbolNode.childStats[type].highlight = size;
            }
            if (this._filterTest(symbolNode)) {
                this._attachToParent(symbolNode, fileNode);
            }
        }
        // unless we filtered out every symbol belonging to this file,
        if (fileNode.children.length > 0) {
            // build all ancestor nodes for this file
            let orphanNode = fileNode;
            while (orphanNode.parent == null && orphanNode !== this.rootNode) {
                orphanNode = this._getOrMakeParentNode(orphanNode);
            }
        }
    }
    /**
     * Finalize the creation of the tree and return the root node.
     */
    build() {
        this._getPath = () => '';
        this._filterTest = () => false;
        this._parents.clear();
        return this.rootNode;
    }
    /**
     * Internal handler for `find` to search for a node.
     * @private
     * @param {string[]} idPathList
     * @param {TreeNode} node
     * @returns {TreeNode | null}
     */
    _find(idPathList, node) {
        if (node == null) {
            return null;
        }
        else if (idPathList.length === 0) {
            // Found desired node
            return node;
        }
        const [shortNameToFind] = idPathList;
        const child = node.children.find(n => shortName(n) === shortNameToFind);
        return this._find(idPathList.slice(1), child);
    }
    /**
     * Find a node with a given `idPath` by traversing the tree.
     * @param {string} idPath
     */
    find(idPath) {
        // If `idPath` is the root's ID, return the root
        if (idPath === this.rootNode.idPath) {
            return this.rootNode;
        }
        const symbolIndex = idPath.indexOf(':');
        let path;
        if (symbolIndex > -1) {
            const filePath = idPath.slice(0, symbolIndex);
            const symbolName = idPath.slice(symbolIndex + 1);
            path = filePath.split(this._splitter);
            path.push(symbolName);
        }
        else {
            path = idPath.split(this._splitter);
        }
        // If the path is empty, it refers to the _NO_NAME container.
        if (path[0] === '') {
            path.unshift(_NO_NAME);
        }
        return this._find(path, this.rootNode);
    }
}
/**
 * Parse the options represented as a query string, into an object.
 * Includes checks for valid values.
 * @param {string} options Query string
 */
function parseOptions(options) {
    const params = new URLSearchParams(options);
    const url = params.get('load_url');
    const groupBy = params.get('group_by') || 'source_path';
    const methodCountMode = params.has('method_count');
    const filterGeneratedFiles = params.has('generated_filter');
    const flagToHighlight = _NAMES_TO_FLAGS[params.get('highlight')];
    let minSymbolSize = Number(params.get('min_size'));
    if (Number.isNaN(minSymbolSize)) {
        minSymbolSize = 0;
    }
    const includeRegex = params.get('include');
    const excludeRegex = params.get('exclude');
    let typeFilter;
    if (methodCountMode) {
        typeFilter = new Set(_DEX_METHOD_SYMBOL_TYPE);
    }
    else {
        typeFilter = new Set(types(params.getAll(_TYPE_STATE_KEY)));
        if (typeFilter.size === 0) {
            typeFilter = new Set(_SYMBOL_TYPE_SET);
            typeFilter.delete('b');
        }
    }
    /**
     * List of functions that
     * check each symbol. If any returns false, the symbol will not be used.
     */
    const filters = [];
    // Ensure symbol size is past the minimum
    if (minSymbolSize > 0) {
        filters.push(s => Math.abs(s.size) >= minSymbolSize);
    }
    // Ensure the symbol size wasn't filtered out
    if (typeFilter.size < _SYMBOL_TYPE_SET.size) {
        filters.push(s => typeFilter.has(s.type));
    }
    // Only show generated files
    if (filterGeneratedFiles) {
        filters.push(s => hasFlag(_FLAGS.GENERATED_SOURCE, s));
    }
    // Search symbol names using regex
    if (includeRegex) {
        try {
            const regex = new RegExp(includeRegex);
            filters.push(s => regex.test(s.idPath));
        }
        catch (err) {
            if (err.name !== 'SyntaxError')
                throw err;
        }
    }
    if (excludeRegex) {
        try {
            const regex = new RegExp(excludeRegex);
            filters.push(s => !regex.test(s.idPath));
        }
        catch (err) {
            if (err.name !== 'SyntaxError')
                throw err;
        }
    }
    /**
     * Check that a symbol node passes all the filters in the filters array.
     * @param {TreeNode} symbolNode
     */
    function filterTest(symbolNode) {
        return filters.every(fn => fn(symbolNode));
    }
    let highlightTest;
    if (flagToHighlight) {
        highlightTest = symbolNode => hasFlag(flagToHighlight, symbolNode);
    }
    else {
        highlightTest = () => false;
    }
    return { groupBy, filterTest, highlightTest, url };
}
let builder = null;
const fetcher = new TravisFetcher('GoogleChromeLabs/travis-size-report');
/**
 * Assemble a tree when this worker receives a message.
 * @param {string} groupBy Sets how the tree is grouped.
 * @param {(symbolNode: TreeNode) => boolean} filterTest Filter function that
 * each symbol is tested against
 * @param {(symbolNode: TreeNode) => boolean} highlightTest Filter function that
 * each symbol's flags are tested against
 * @param {(msg: TreeProgress) => void} onProgress
 * @returns {Promise<TreeProgress>}
 */
async function buildTree(groupBy, filterTest, highlightTest, onProgress) {
    /** @type {Meta | null} Object from the first line of the data file */
    let meta = null;
    const getPathMap = {
        component(fileEntry) {
            const component = getComponent(meta, fileEntry);
            const path = getSourcePath(fileEntry);
            return `${component || '(No component)'}>${path}`;
        },
        source_path: getSourcePath,
    };
    /**
     * Creates data to post to the UI thread. Defaults will be used for the root
     * and percent values if not specified.
     * @param data Default data values to post.
     */
    function createProgressMessage(data = {}) {
        let { percent } = data;
        if (percent == null) {
            if (meta == null) {
                percent = 0;
            }
            else {
                percent = Math.max(builder.rootNode.size / meta.total, 0.1);
            }
        }
        const message = {
            root: builder.formatNode(data.root || builder.rootNode),
            percent,
            diffMode: Boolean(meta && meta.diff_mode),
        };
        if (data.error) {
            message.error = data.error.message;
        }
        return message;
    }
    /**
     * Post data to the UI thread. Defaults will be used for the root and percent
     * values if not specified.
     */
    function postToUi() {
        const message = createProgressMessage();
        message.id = 0;
        onProgress(message);
    }
    try {
        // Post partial state every second
        let lastBatchSent = Date.now();
        let diffMode = null;
        for await (const dataObj of fetcher.newlineDelimtedJsonStream()) {
            if (meta == null) {
                // First line of data is used to store meta information.
                meta = dataObj;
                diffMode = meta.diff_mode;
                builder = new TreeBuilder({
                    getPath: getPathMap[groupBy],
                    filterTest,
                    highlightTest,
                    sep: groupBy === 'component' ? '>' : _PATH_SEP,
                    meta,
                });
                postToUi();
            }
            else {
                builder.addFileEntry(dataObj, diffMode);
                const currentTime = Date.now();
                if (currentTime - lastBatchSent > 500) {
                    postToUi();
                    await Promise.resolve(); // Pause loop to check for worker messages
                    lastBatchSent = currentTime;
                }
            }
        }
        return createProgressMessage({
            root: builder.build(),
            percent: 1,
        });
    }
    catch (error) {
        if (error.name === 'AbortError') {
            console.info(error.message);
        }
        else {
            console.error(error);
        }
        return createProgressMessage({ error });
    }
}
const actions = {
    load({ input, options }) {
        const { groupBy, filterTest, highlightTest, url } = parseOptions(options);
        if (input === 'from-url://') {
            if (url) {
                // Display the data from the `load_url` query parameter
                console.info('Displaying data from', url);
                fetcher.setInput(url);
            }
        }
        else if (input != null) {
            console.info('Displaying uploaded data');
            fetcher.setInput(input);
        }
        return buildTree(groupBy, filterTest, highlightTest, progress => {
            // @ts-ignore
            self.postMessage(progress);
        });
    },
    /** @param {string} path */
    async open(path) {
        if (!builder)
            throw new Error('Called open before load');
        const node = builder.find(path);
        return builder.formatNode(node);
    },
};
/**
 * Call the requested action function with the given data. If an error is thrown
 * or rejected, post the error message to the UI thread.
 * @param {number} id Unique message ID.
 * @param {string} action Action type, corresponding to a key in `actions.`
 * @param {any} data Data to supply to the action function.
 */
async function runAction(id, action, data) {
    try {
        const result = await actions[action](data);
        // @ts-ignore
        self.postMessage({ id, result });
    }
    catch (err) {
        // @ts-ignore
        self.postMessage({ id, error: err.message });
        throw err;
    }
}
const runActionDebounced = debounce(runAction, 0);
/**
 * @param {MessageEvent} event Event for when this worker receives a message.
 */
self.onmessage = async (event) => {
    const { id, action, data } = event.data;
    if (action === 'load') {
        // Loading large files will block the worker thread until complete or when
        // an await statement is reached. During this time, multiple load messages
        // can pile up due to filters being adjusted. We debounce the load call
        // so that only the last message is read (the current set of filters).
        runActionDebounced(id, action, data);
    }
    else {
        runAction(id, action, data);
    }
};
//# sourceMappingURL=tree-worker.js.map
