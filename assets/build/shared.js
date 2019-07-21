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
Object.assign(self, {
    _KEYS,
    _FLAGS,
    _BYTE_UNITS,
    _CONTAINER_TYPES,
    _CONTAINER_TYPE_SET,
    _CODE_SYMBOL_TYPE,
    _DEX_METHOD_SYMBOL_TYPE,
    _DEX_SYMBOL_TYPE,
    _OTHER_SYMBOL_TYPE,
    _SYMBOL_TYPE_SET,
    _NO_NAME,
    _TYPE_STATE_KEY,
    _LOCALE,
    shortName,
    types,
    debounce,
    hasFlag,
});
//# sourceMappingURL=shared.js.map
