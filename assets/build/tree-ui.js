import { f as form, s as state, g as getIconTemplate, a as getIconStyle, d as dom, b as getSizeContents, c as setSizeClasses } from './chunk.js';

// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
const _innerWorker = new Worker('build/tree-worker.js');
/**
 * We use a worker to keep large tree creation logic off the UI thread.
 * This class is used to interact with the worker.
 */
class TreeWorker {
    /**
     * @param {Worker} worker Web worker to wrap
     */
    constructor(worker) {
        /** ID counter used by `waitForResponse` */
        this._requestId = 1;
        this._loadTreeCallback = null;
        this._worker = worker;
        this._worker.addEventListener('message', event => {
            if (this._loadTreeCallback && event.data.id === 0) {
                this._loadTreeCallback(event.data);
            }
        });
    }
    _waitForResponse(action, data) {
        const id = ++this._requestId;
        return new Promise((resolve, reject) => {
            const handleResponse = (event) => {
                if (event.data.id === id) {
                    this._worker.removeEventListener('message', handleResponse);
                    if (event.data.error) {
                        reject(event.data.error);
                    }
                    else {
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
    openNode(idPath) {
        return this._waitForResponse('open', idPath);
    }
    /**
     * Set callback used after `loadTree` is first called.
     * @param callback Called when the worker
     * has some data to display. Complete when `progress` is 1.
     */
    setOnProgressHandler(callback) {
        this._loadTreeCallback = callback;
    }
    /**
     * Loads the tree data given on a worker thread and replaces the tree view in
     * the UI once complete. Uses query string as state for the options.
     * Use `onProgress` before calling `loadTree`.
     * @param {string} input
     */
    loadTree(input = null) {
        return this._waitForResponse('load', {
            input,
            options: location.search.slice(1),
        });
    }
}
const worker = new TreeWorker(_innerWorker);
// Kick off the worker ASAP so it can start parsing data faster.
// Subsequent calls will just use a worker locally.
const treeReady = worker.loadTree('from-url://');

// Copyright 2018 The Chromium Authors. All rights reserved.
const newTreeElement = (() => {
    /** Capture one of: "::", "../", "./", "/", "#" */
    const _SPECIAL_CHAR_REGEX = /(::|(?:\.*\/)+|#)/g;
    /** Insert zero-width space after capture group */
    const _ZERO_WIDTH_SPACE = '$&\u200b';
    // Templates for tree nodes in the UI.
    /** Template for leaves in the tree */
    const _leafTemplate = document.querySelector('#treenode-symbol');
    /** Template for trees */
    const _treeTemplate = document.querySelector('#treenode-container');
    /** Symbol tree container */
    const _symbolTree = document.querySelector('#symboltree');
    /**
     * HTMLCollection of all tree node elements. Updates itself automatically.
     */
    const _liveNodeList = document.getElementsByClassName('node');
    /**
     * Associates UI nodes with the corresponding tree data object
     * so that event listeners and other methods can
     * query the original data.
     */
    const _uiNodeData = new WeakMap();
    /**
     * Applies highlights to the tree element based on certain flags and state.
     * @param {HTMLSpanElement} symbolNameElement Element that displays the
     * short name of the tree item.
     * @param {TreeNode} node Data about this symbol name element's tree node.
     */
    function _highlightSymbolName(symbolNameElement, node) {
        const dexMethodStats = node.childStats[_DEX_METHOD_SYMBOL_TYPE];
        if (dexMethodStats && dexMethodStats.count < 0) {
            // This symbol was removed between the before and after versions.
            symbolNameElement.classList.add('removed');
        }
    }
    /**
     * Replace the contents of the size element for a tree node.
     * @param {HTMLElement} sizeElement Element that should display the size
     * @param {TreeNode} node Data about this size element's tree node.
     */
    function _setSize(sizeElement, node) {
        const { description, element, value } = getSizeContents(node);
        // Replace the contents of '.size' and change its title
        dom.replace(sizeElement, element);
        sizeElement.title = description;
        setSizeClasses(sizeElement, value);
    }
    /**
     * Sets focus to a new tree element while updating the element that last had
     * focus. The tabindex property is used to avoid needing to tab through every
     * single tree item in the page to reach other areas.
     * @param {number | HTMLElement} el Index of tree node in `_liveNodeList`
     */
    function _focusTreeElement(el) {
        const lastFocused = document.activeElement;
        // If the last focused element was a tree node element, change its tabindex.
        if (_uiNodeData.has(lastFocused)) {
            // Update DOM
            lastFocused.tabIndex = -1;
        }
        const element = typeof el === 'number' ? _liveNodeList[el] : el;
        if (element != null) {
            // Update DOM
            element.tabIndex = 0;
            element.focus();
        }
    }
    /**
     * Click event handler to expand or close the child group of a tree.
     */
    async function _toggleTreeElement(event) {
        event.preventDefault();
        // See `#treenode-container` for the relation of these elements.
        const link = event.currentTarget;
        const treeitem = link.parentElement;
        const group = link.nextElementSibling;
        const isExpanded = treeitem.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
            // Update DOM
            treeitem.setAttribute('aria-expanded', 'false');
            dom.replace(group, null);
        }
        else {
            treeitem.setAttribute('aria-expanded', 'true');
            // Get data for the children of this tree node element. If the children
            // have not yet been loaded, request for the data from the worker.
            let data = _uiNodeData.get(link) || null;
            if (data == null || data.children == null) {
                const symbolName = link.querySelector('.symbol-name');
                const idPath = symbolName.title;
                data = await worker.openNode(idPath);
                _uiNodeData.set(link, data);
            }
            const newElements = data.children.map(child => newTreeElement(child));
            if (newElements.length === 1) {
                // Open the inner element if it only has a single child.
                // Ensures nodes like "java"->"com"->"google" are opened all at once.
                const link = newElements[0].querySelector('.node');
                link.click();
            }
            const newElementsFragment = dom.createFragment(newElements);
            // Update DOM
            requestAnimationFrame(() => {
                group.appendChild(newElementsFragment);
            });
        }
    }
    /**
     * Tree view keydown event handler to move focus for the given element.
     * @param {KeyboardEvent} event Event passed from keydown event listener.
     */
    function _handleKeyNavigation(event) {
        if (event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        /**
         * Tree node element, either a tree or leaf. Trees use `<a>` tags,
         * leaves use `<span>` tags.
         * See `#treenode-container` and `#treenode-symbol`.
         */
        const link = event.target;
        /** Index of this element in the node list */
        const focusIndex = Array.prototype.indexOf.call(_liveNodeList, link);
        /** Focus the tree element immediately following this one */
        function _focusNext() {
            if (focusIndex > -1 && focusIndex < _liveNodeList.length - 1) {
                event.preventDefault();
                _focusTreeElement(focusIndex + 1);
            }
        }
        /** Open or close the tree element */
        function _toggle() {
            event.preventDefault();
            link.click();
        }
        /**
         * Focus the tree element at `index` if it starts with `char`.
         * @returns {boolean} True if the short name did start with `char`.
         */
        function _focusIfStartsWith(char, index) {
            const data = _uiNodeData.get(_liveNodeList[index]);
            if (shortName(data).startsWith(char)) {
                event.preventDefault();
                _focusTreeElement(index);
                return true;
            }
            else {
                return false;
            }
        }
        switch (event.key) {
            // Space should act like clicking or pressing enter & toggle the tree.
            case ' ':
                _toggle();
                break;
            // Move to previous focusable node
            case 'ArrowUp':
                if (focusIndex > 0) {
                    event.preventDefault();
                    _focusTreeElement(focusIndex - 1);
                }
                break;
            // Move to next focusable node
            case 'ArrowDown':
                _focusNext();
                break;
            // If closed tree, open tree. Otherwise, move to first child.
            case 'ArrowRight': {
                const expanded = link.parentElement.getAttribute('aria-expanded');
                if (expanded != null) {
                    // Leafs do not have the aria-expanded property
                    if (expanded === 'true') {
                        _focusNext();
                    }
                    else {
                        _toggle();
                    }
                }
                break;
            }
            // If opened tree, close tree. Otherwise, move to parent.
            case 'ArrowLeft':
                {
                    const isExpanded = link.parentElement.getAttribute('aria-expanded') === 'true';
                    if (isExpanded) {
                        _toggle();
                    }
                    else {
                        const groupList = link.parentElement.parentElement;
                        if (groupList.getAttribute('role') === 'group') {
                            event.preventDefault();
                            const parentLink = groupList.previousElementSibling;
                            _focusTreeElement(parentLink);
                        }
                    }
                }
                break;
            // Focus first node
            case 'Home':
                event.preventDefault();
                _focusTreeElement(0);
                break;
            // Focus last node on screen
            case 'End':
                event.preventDefault();
                _focusTreeElement(_liveNodeList.length - 1);
                break;
            // Expand all sibling nodes
            case '*':
                const groupList = link.parentElement.parentElement;
                if (groupList.getAttribute('role') === 'group') {
                    event.preventDefault();
                    for (const li of groupList.children) {
                        if (li.getAttribute('aria-expanded') !== 'true') {
                            const otherLink = li.querySelector('.node');
                            otherLink.click();
                        }
                    }
                }
                break;
            // Remove focus from the tree view.
            case 'Escape':
                link.blur();
                break;
            // If a letter was pressed, find a node starting with that character.
            default:
                if (event.key.length === 1 && event.key.match(/\S/)) {
                    // Check all nodes below this one.
                    for (let i = focusIndex + 1; i < _liveNodeList.length; i++) {
                        if (_focusIfStartsWith(event.key, i))
                            return;
                    }
                    // Starting from the top, check all nodes above this one.
                    for (let i = 0; i < focusIndex; i++) {
                        if (_focusIfStartsWith(event.key, i))
                            return;
                    }
                }
                break;
        }
    }
    /**
     * Returns an event handler for elements with the `data-dynamic` attribute.
     * The handler updates the state manually, then iterates all nodes and
     * applies `callback` to certain child elements of each node.
     * The elements are expected to be direct children of `.node` elements.
     */
    function _handleDynamicInputChange(selector, callback) {
        return (event) => {
            const input = event.target;
            // Update state early.
            // This way, the state will be correct if `callback` looks at it.
            state.set(input.name, input.value);
            for (const link of _liveNodeList) {
                const element = link.querySelector(selector);
                callback(element, _uiNodeData.get(link));
            }
        };
    }
    /**
     * Inflate a template to create an element that represents one tree node.
     * The element will represent a tree or a leaf, depending on if the tree
     * node object has any children. Trees use a slightly different template
     * and have click event listeners attached.
     * @param {TreeNode} data Data to use for the UI.
     * @returns {DocumentFragment}
     */
    function newTreeElement(data) {
        const isLeaf = data.children && data.children.length === 0;
        const template = isLeaf ? _leafTemplate : _treeTemplate;
        const element = document.importNode(template.content, true);
        // Associate clickable node & tree data
        const link = element.querySelector('.node');
        _uiNodeData.set(link, Object.freeze(data));
        // Icons are predefined in the HTML through hidden SVG elements
        const container = data.type[0];
        const type = data.type.slice(1);
        const icon = getIconTemplate(container, type);
        if (!isLeaf) {
            const symbolStyle = getIconStyle(type);
            icon.setAttribute('fill', symbolStyle.color);
        }
        // Insert an SVG icon at the start of the link to represent type
        link.insertBefore(icon, link.firstElementChild);
        // Set the symbol name and hover text
        const symbolName = element.querySelector('.symbol-name');
        symbolName.textContent = shortName(data).replace(_SPECIAL_CHAR_REGEX, _ZERO_WIDTH_SPACE);
        symbolName.title = data.idPath;
        _highlightSymbolName(symbolName, data);
        // Set the byte size and hover text
        _setSize(element.querySelector('.size'), data);
        if (!isLeaf) {
            link.addEventListener('click', _toggleTreeElement);
        }
        return element;
    }
    // When the `byteunit` state changes, update all .size elements.
    const _byteunitSelect = form.elements.namedItem('byteunit');
    _byteunitSelect.addEventListener('change', _handleDynamicInputChange('.size', _setSize));
    _symbolTree.addEventListener('keydown', _handleKeyNavigation);
    _symbolTree.addEventListener('focusout', () => _symbolTree.parentElement.classList.remove('focused'));
    window.addEventListener('keydown', event => {
        const focusedElement = event.target;
        if (event.key === '?' && focusedElement.tagName !== 'INPUT') {
            // Open help when "?" is pressed
            document.getElementById('faq').click();
        }
    });
    import('./infocard-ui.js').then(({ displayInfocard }) => {
        _symbolTree.addEventListener('focusin', (event) => {
            const link = event.target;
            displayInfocard(_uiNodeData.get(link));
            _symbolTree.parentElement.classList.add('focused');
        });
        _symbolTree.addEventListener('mouseover', event => {
            const active = document.activeElement;
            const nodeAlreadyFocused = active && active.matches('.node');
            const mouseOvered = event.target;
            const link = mouseOvered.closest('.node');
            // Display the infocard when a node is hovered over,
            // unless another node is currently focused
            if (link != null && !nodeAlreadyFocused) {
                displayInfocard(_uiNodeData.get(link));
            }
        });
    });
    return newTreeElement;
})();
{
    class ProgressBar {
        constructor(selector) {
            this._element = document.querySelector(selector);
            this.lastValue = this._element.value;
        }
        setValue(val) {
            if (val === 0 || val >= this.lastValue) {
                this._element.value = val;
                this.lastValue = val;
            }
            else {
                // Reset to 0 so the progress bar doesn't animate backwards.
                this.setValue(0);
                requestAnimationFrame(() => this.setValue(val));
            }
        }
    }
    const _symbolTree = document.querySelector('#symboltree');
    const _dataUrlInput = form.elements.namedItem('load_url');
    const _progress = new ProgressBar('#progress');
    /**
     * Displays the given data as a tree view
     */
    function displayTree(message) {
        const { root, percent, diffMode, error } = message;
        let rootElement = null;
        if (root) {
            rootElement = newTreeElement(root);
            const link = rootElement.querySelector('.node');
            // Expand the root UI node
            link.click();
            link.tabIndex = 0;
        }
        state.set('diff_mode', diffMode ? 'on' : null);
        // Double requestAnimationFrame ensures that the code inside executes in a
        // different frame than the above tree element creation.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            _progress.setValue(percent);
            if (error) {
                document.body.classList.add('error');
            }
            else {
                document.body.classList.remove('error');
            }
            if (diffMode) {
                document.body.classList.add('diff');
            }
            else {
                document.body.classList.remove('diff');
            }
            dom.replace(_symbolTree, rootElement);
        }));
    }
    treeReady.then(displayTree);
    worker.setOnProgressHandler(displayTree);
    form.addEventListener('change', event => {
        const input = event.target;
        // Update the tree when options change.
        // Some options update the tree themselves, don't regenerate when those
        // options (marked by `data-dynamic`) are changed.
        if (!input.dataset.hasOwnProperty('dynamic')) {
            _progress.setValue(0);
            worker.loadTree().then(displayTree);
        }
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        _progress.setValue(0);
        worker.loadTree().then(displayTree);
    });
}
//# sourceMappingURL=tree-ui.js.map
