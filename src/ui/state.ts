// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview
 * Methods for manipulating the state and the DOM of the page
 */

/** Form containing options and filters */
export const form = document.querySelector<HTMLFormElement>('#options')!;

/** Utilities for working with the DOM */
export const dom = {
  /**
   * Create a document fragment from the given nodes
   */
  createFragment(nodes: Iterable<Node>): DocumentFragment {
    const fragment = document.createDocumentFragment();
    for (const node of nodes) fragment.appendChild(node);
    return fragment;
  },
  /**
   * Removes all the existing children of `parent` and inserts
   * `newChild` in their place
   */
  replace(parent: Node, newChild: Node | null) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
    if (newChild != null) parent.appendChild(newChild);
  },
  /**
   * Builds a text element in a single statement.
   * @param {string} tagName Type of the element, such as "span".
   * @param {string} text Text content for the element.
   * @param {string} [className] Class to apply to the element.
   */
  textElement(tagName: string, text: string, className?: string) {
    const element = document.createElement(tagName);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  },
};

/** Build utilities for working with the state. */
function _initState() {
  const _DEFAULT_FORM = new FormData(form);

  /**
   * State is represented in the query string and
   * can be manipulated by this object. Keys in the query match with
   * input names.
   */
  let _filterParams = new URLSearchParams(location.search.slice(1));
  const typeList = _filterParams.getAll(_TYPE_STATE_KEY);
  _filterParams.delete(_TYPE_STATE_KEY);
  for (const type of types(typeList)) {
    _filterParams.append(_TYPE_STATE_KEY, type);
  }

  const state = Object.freeze({
    /**
     * Returns a string from the current query string state.
     * @param {string} key
     * @returns {string | null}
     */
    get(key: string) {
      return _filterParams.get(key);
    },
    /**
     * Checks if a key is present in the query string state.
     * @param {string} key
     * @returns {boolean}
     */
    has(key: string) {
      return _filterParams.has(key);
    },
    /**
     * Formats the filter state as a string.
     */
    toString() {
      const copy = new URLSearchParams(_filterParams);
      const types = [...new Set(copy.getAll(_TYPE_STATE_KEY))];
      if (types.length > 0) copy.set(_TYPE_STATE_KEY, types.join(''));

      const queryString = copy.toString();
      return queryString.length > 0 ? `?${queryString}` : '';
    },
    /**
     * Saves a key and value into a temporary state not displayed in the URL.
     * @param {string} key
     * @param {string | null} value
     */
    set(key: string, value: string | null) {
      if (value == null) {
        _filterParams.delete(key);
      } else {
        _filterParams.set(key, value);
      }
      history.replaceState(null, null as any, state.toString());
    },
  });

  // Update form inputs to reflect the state from URL.
  for (const element of Array.from(form.elements)) {
    const input = element as HTMLInputElement;
    if (input.name) {
      const values = _filterParams.getAll(input.name);
      const [value] = values;
      if (value) {
        switch (input.type) {
          case 'checkbox':
            input.checked = values.includes(input.value);
            break;
          case 'radio':
            input.checked = value === input.value;
            break;
          default:
            input.value = value;
            break;
        }
      }
    }
  }

  /**
   * Yields only entries that have been modified in
   * comparison to `_DEFAULT_FORM`.
   * @param {FormData} modifiedForm
   * @returns {IterableIterator<[string, string]>}
   */
  function* onlyChangedEntries(modifiedForm: FormData): IterableIterator<[string, string]> {
    // Remove default values
    for (const key of modifiedForm.keys()) {
      const modifiedValues = modifiedForm.getAll(key);
      const defaultValues = _DEFAULT_FORM.getAll(key);

      const valuesChanged =
        modifiedValues.length !== defaultValues.length ||
        modifiedValues.some((v, i) => v !== defaultValues[i]);
      if (valuesChanged) {
        for (const value of modifiedValues) {
          yield [key, value as string];
        }
      }
    }
  }

  // Update the state when the form changes.
  function _updateStateFromForm() {
    const modifiedForm = new FormData(form);
    _filterParams = new URLSearchParams(Array.from(onlyChangedEntries(modifiedForm)));
    history.replaceState(null, null as any, state.toString());
  }

  form.addEventListener('change', _updateStateFromForm);

  return state;
}

function _startListeners() {
  const _SHOW_OPTIONS_STORAGE_KEY = 'show-options';

  const typesFilterContainer = document.querySelector<HTMLFieldSetElement>('#types-filter')!;
  const byteunit = form.elements.namedItem('byteunit') as HTMLFieldSetElement;
  const typeCheckboxes = (form.elements.namedItem(_TYPE_STATE_KEY) as unknown) as HTMLCollectionOf<
    HTMLInputElement
  >;
  const sizeHeader = document.querySelector<HTMLSpanElement>('#size-header')!;

  /**
   * The settings dialog on the side can be toggled on and off by elements with
   * a 'toggle-options' class.
   */
  function _toggleOptions() {
    const openedOptions = document.body.classList.toggle('show-options');
    localStorage.setItem(_SHOW_OPTIONS_STORAGE_KEY, openedOptions.toString());
  }
  for (const button of document.getElementsByClassName('toggle-options')) {
    button.addEventListener('click', _toggleOptions);
  }
  // Default to open if getItem returns null
  if (localStorage.getItem(_SHOW_OPTIONS_STORAGE_KEY) !== 'false') {
    document.body.classList.add('show-options');
  }

  /**
   * Display error text on blur for regex inputs, if the input is invalid.
   * @param {Event} event
   */
  function checkForRegExError(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const errorBox = document.getElementById(input.getAttribute('aria-describedby')!)!;
    try {
      new RegExp(input.value);
      errorBox.textContent = '';
      input.setAttribute('aria-invalid', 'false');
    } catch (err) {
      errorBox.textContent = err.message;
      input.setAttribute('aria-invalid', 'true');
    }
  }
  for (const input of document.getElementsByClassName('input-regex')) {
    input.addEventListener('blur', checkForRegExError);
    input.dispatchEvent(new Event('blur'));
  }

  document.getElementById('type-all')!.addEventListener('click', () => {
    for (const checkbox of typeCheckboxes) {
      checkbox.checked = true;
    }
    form.dispatchEvent(new Event('change'));
  });
  document.getElementById('type-none')!.addEventListener('click', () => {
    for (const checkbox of typeCheckboxes) {
      checkbox.checked = false;
    }
    form.dispatchEvent(new Event('change'));
  });
}

function _makeIconTemplateGetter() {
  const _icons = document.getElementById('icons')!;

  /**
   * Icon elements that correspond to each symbol type.
   */
  const symbolIcons: { [type: string]: SVGSVGElement } = {
    D: _icons.querySelector<SVGSVGElement>('.foldericon')!,
    J: _icons.querySelector<SVGSVGElement>('.javaclassicon')!,
    F: _icons.querySelector<SVGSVGElement>('.fileicon')!,
    b: _icons.querySelector<SVGSVGElement>('.bssicon')!,
    d: _icons.querySelector<SVGSVGElement>('.dataicon')!,
    r: _icons.querySelector<SVGSVGElement>('.readonlyicon')!,
    t: _icons.querySelector<SVGSVGElement>('.codeicon')!,
    R: _icons.querySelector<SVGSVGElement>('.relroicon')!,
    '*': _icons.querySelector<SVGSVGElement>('.generatedicon')!,
    x: _icons.querySelector<SVGSVGElement>('.dexicon')!,
    m: _icons.querySelector<SVGSVGElement>('.dexmethodicon')!,
    p: _icons.querySelector<SVGSVGElement>('.localpakicon')!,
    P: _icons.querySelector<SVGSVGElement>('.nonlocalpakicon')!,
    o: _icons.querySelector<SVGSVGElement>('.othericon')!, // used as default icon
  };

  const iconInfoCache = new Map<string, { color: string; description: string }>();

  /**
   * Returns the SVG icon template element corresponding to the given type.
   * @param {string} container Container type character.
   * @param {string} type Symbol type (file extension).
   * @param {boolean} readonly If true, the original template is returned.
   * If false, a copy is returned that can be modified.
   * @returns {SVGSVGElement}
   */
  function getIconTemplate(container: string, type: string, readonly = false): SVGSVGElement {
    const iconTemplate =
      container === _SYMBOL_CONTAINER_TYPE
        ? symbolIcons[type] || symbolIcons[_OTHER_SYMBOL_TYPE]
        : symbolIcons[container];
    return readonly ? iconTemplate : (iconTemplate.cloneNode(true) as SVGSVGElement);
  }

  /**
   * Returns style info about SVG icon template element corresponding to the
   * given type.
   * @param {string} type Symbol type character / file extension.
   */
  function getIconStyle(type: string) {
    let info = iconInfoCache.get(type);
    if (info == null) {
      const icon = getIconTemplate(_SYMBOL_CONTAINER_TYPE, type, true);
      info = {
        color: icon.getAttribute('fill')!,
        description: icon.querySelector('title')!.textContent!,
      };
      iconInfoCache.set(type, info);
    }
    return info;
  }

  return { getIconTemplate, getIconStyle };
}

function _makeSizeTextGetter() {
  const _SIZE_CHANGE_CUTOFF = 50000;

  /**
   * Create the contents for the size element of a tree node.
   * The unit to use is selected from the current state.
   *
   * If in method count mode, size instead represents the amount of methods in
   * the node. Otherwise, the original number of bytes will be displayed.
   *
   * @param {TreeNode} node Node whose size is the number of bytes to use for
   * the size text
   * @returns {GetSizeResult} Object with hover text title and
   * size element body. Can be consumed by `_applySizeFunc()`
   */
  function getSizeContents(node: TreeNode): GetSizeResult {
    let bytes: number;
    if (state.has('gzip')) {
      bytes = node.size; // TODO: = node.gzipSize
    } else {
      bytes = node.size;
    }

    const bytesGrouped = bytes.toLocaleString(_LOCALE, { useGrouping: true });
    let description = `${bytesGrouped} bytes`;

    const unit = (state.get('byteunit') as keyof typeof _BYTE_UNITS) || 'KiB';
    const suffix = _BYTE_UNITS[unit];
    // Format |bytes| as a number with 2 digits after the decimal point
    const text = (bytes / suffix).toLocaleString(_LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const textNode = document.createTextNode(`${text} `);
    // Display the suffix with a smaller font
    const suffixElement = dom.textElement('small', unit);

    return {
      description,
      element: dom.createFragment([textNode, suffixElement]),
      value: bytes,
    };
  }

  /**
   * Set classes on an element based on the size it represents.
   */
  function setSizeClasses(sizeElement: HTMLElement, value: number) {
    const shouldHaveStyle = state.has('diff_mode') && Math.abs(value) > _SIZE_CHANGE_CUTOFF;
    if (shouldHaveStyle) {
      if (value < 0) {
        sizeElement.classList.add('shrunk');
        sizeElement.classList.remove('grew');
      } else {
        sizeElement.classList.remove('shrunk');
        sizeElement.classList.add('grew');
      }
    } else {
      sizeElement.classList.remove('shrunk', 'grew');
    }
  }

  return { getSizeContents, setSizeClasses };
}

/** Utilities for working with the state */
export const state = _initState();
const { getIconTemplate, getIconStyle } = _makeIconTemplateGetter();
const { getSizeContents, setSizeClasses } = _makeSizeTextGetter();
_startListeners();

export { getIconTemplate, getIconStyle, getSizeContents, setSizeClasses };
