/**
 * DOM helpers that turn a form control into a labelled "field context".
 *
 * Job boards bury the real question in one of many places: an explicit
 * <label>, aria attributes, a placeholder, a heading, or plain text right
 * before/after the control. This module collects all of those candidates
 * with a confidence weight so the rule matcher can score them.
 */
"use strict";
(() => {
  if (window.JALabels) return;
  const norm = (value) => window.JAProfile.normalizeText(value);

  const CONTROL_SELECTOR =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea, [contenteditable="true"], [contenteditable=""], [role="combobox"], [role="textbox"], [aria-haspopup="listbox"]';

  let visibilityOverride = null;

  /** Used by the automated tests, where layout is not available. */
  const setVisibilityCheck = (fn) => {
    visibilityOverride = typeof fn === "function" ? fn : null;
  };

  const isVisible = (el) => {
    if (visibilityOverride) return Boolean(el && visibilityOverride(el));
    if (!el || !el.isConnected) return false;
    try {
      if (el.closest('[aria-hidden="true"]')) return false;
      const style = window.getComputedStyle(el);
      if (!style) return false;
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
        return false;
      }
      if (Number(style.opacity) === 0) return false;
      if (el.hidden) return false;
      const rect = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
      if (rect && rect.width > 0 && rect.height > 0) return true;
      const rects = typeof el.getClientRects === "function" ? el.getClientRects() : null;
      if (rects && rects.length > 0) return true;
      // Some custom controls report zero size until opened. Fall back to
      // offsetParent / fixed positioning instead of dropping them entirely.
      if (el.offsetParent !== null) return true;
      if (style.position === "fixed") return true;
      return false;
    } catch (_) {
      return true;
    }
  };

  const isUsable = (el) => {
    if (!el || !el.isConnected) return false;
    if (el.disabled) return false;
    if (el.getAttribute("aria-disabled") === "true") return false;
    if (el.readOnly) return false;
    return isVisible(el);
  };

  const collapse = (text) =>
    String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const textOf = (node, depth = 0) => {
    if (!node || depth > 7) return "";
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (/^(SCRIPT|STYLE|NOSCRIPT|SVG|IMG|VIDEO|CANVAS|IFRAME|SELECT|TEXTAREA|INPUT|OPTION)$/i.test(node.tagName)) {
      return "";
    }
    if (node.getAttribute("aria-hidden") === "true") return "";
    let text = "";
    for (const child of node.childNodes) {
      text += ` ${textOf(child, depth + 1)}`;
      if (text.length > 320) break;
    }
    return text;
  };

  const clean = (text) => collapse(text).slice(0, 160);

  const addCandidate = (list, text, weight, source) => {
    const value = clean(text);
    if (!value) return;
    const key = norm(value);
    if (!key || key.length > 140) return;
    if (/^(search|search\.\.\.|type to search|pesquisar)$/.test(key)) return;
    const existing = list.find((item) => norm(item.text) === key);
    if (existing) {
      if (weight > existing.weight) {
        existing.weight = weight;
        existing.source = source;
        existing.text = value;
      }
      return;
    }
    list.push({ text: value, weight, source });
  };

  const attributeText = (el, names) => {
    for (const name of names) {
      const value = el.getAttribute && el.getAttribute(name);
      if (value && value.trim() && value.trim().length < 160) return value;
    }
    return "";
  };

  const tokensOf = (el) => {
    const attributes = [
      "name",
      "id",
      "placeholder",
      "autocomplete",
      "data-testid",
      "data-test-id",
      "data-automation-id",
      "data-qa",
      "data-field",
      "data-name",
      "data-input",
      "formcontrolname",
      "aria-label"
    ];
    const parts = [];
    for (const name of attributes) {
      const value = el.getAttribute && el.getAttribute(name);
      if (!value) continue;
      parts.push(
        String(value)
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .replace(/[_[\]./:]+/g, " ")
      );
    }
    if (el.id) parts.push(el.id.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
    return norm(parts.join(" "));
  };

  const autocompleteOf = (el) => {
    const raw = (el.getAttribute && el.getAttribute("autocomplete")) || "";
    if (!raw || /^(on|off)$/i.test(raw)) return "";
    const parts = raw.split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1].toLowerCase() : "";
  };

  const explicitLabels = (el, host, labels) => {
    const labelledBy = (host.getAttribute && host.getAttribute("aria-labelledby")) || el.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const target = id && document.getElementById(id);
        if (target) addCandidate(labels, textOf(target), 1.0, "aria-labelledby");
      }
    }
    const ariaLabel = (host.getAttribute && host.getAttribute("aria-label")) || el.getAttribute("aria-label");
    if (ariaLabel) addCandidate(labels, ariaLabel, 0.98, "aria-label");

    if (el.labels && el.labels.length) {
      for (const label of el.labels) addCandidate(labels, textOf(label), 0.97, "label");
    }
    if (el.id) {
      try {
        const escaped = window.CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/"/g, '\\"');
        const label = document.querySelector(`label[for="${escaped}"]`);
        if (label) addCandidate(labels, textOf(label), 0.97, "label-for");
      } catch (_) {
        /* invalid id selector; ignore */
      }
    }
    const wrapping = el.closest && el.closest("label");
    if (wrapping) addCandidate(labels, textOf(wrapping), 0.93, "wrapping-label");
    if (host !== el) {
      const hostWrapping = host.closest && host.closest("label");
      if (hostWrapping) addCandidate(labels, textOf(hostWrapping), 0.9, "wrapping-label");
    }

    const placeholder = el.getAttribute && el.getAttribute("placeholder");
    if (placeholder) addCandidate(labels, placeholder, 0.78, "placeholder");

    const dataLabel = attributeText(el, [
      "data-label",
      "data-field-label",
      "data-question",
      "data-testid",
      "data-automation-id",
      "data-qa"
    ]);
    if (dataLabel && !/^[a-z0-9_-]{1,12}$/i.test(dataLabel)) {
      addCandidate(labels, dataLabel, 0.7, "data-label");
    }
  };

  const looksLikeHelperText = (text) => {
    const value = collapse(text);
    return (
      !value ||
      /^(https?:\/\/|www\.)/i.test(value) ||
      /\b(suggested|strength|weak|strong|optional|max|min|characters?|remaining|e\.g\.|example|hint|format|upload|pdf|docx|required)\b/i.test(
        value
      ) ||
      /\b(sugestao|forca|fraca|forte|opcional|obrigatorio|maximo|minimo|caracteres|restantes|exemplo|formato|anexo|arquivo)\b/i.test(
        value
      ) ||
      value.length < 3
    );
  };

  // An element the browser is not rendering (hidden step, collapsed section,
  // display:none duplicate). Used to keep previous questions out of the label
  // candidates on multi-step forms such as LinkedIn Easy Apply.
  const domHidden = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    try {
      if (node.hidden) return true;
      if (node.getAttribute && node.getAttribute("aria-hidden") === "true") return true;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse";
    } catch (_) {
      return false;
    }
  };

  const containsControls = (node) => {    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (
      node.matches?.(
        "input:not([type='hidden']), select, textarea, [role='combobox'], [contenteditable='true'], [contenteditable=''], [role='textbox'], [aria-haspopup='listbox']"
      )
    ) {
      return true;
    }
    return Boolean(
      node.querySelector?.(
        "input:not([type='hidden']), select, textarea, [role='combobox'], [contenteditable='true'], [contenteditable=''], [role='textbox'], [aria-haspopup='listbox']"
      )
    );
  };

  const neighbourTexts = (el, direction, limit = 2) => {
    const out = [];
    let node = el;
    let hops = 0;
    while (node && hops < 4 && out.length < limit) {
      let sibling = direction === "previous" ? node.previousElementSibling : node.nextElementSibling;
      let seen = 0;
      while (sibling && seen < 4 && out.length < limit) {
        if (domHidden(sibling)) {
          sibling = direction === "previous" ? sibling.previousElementSibling : sibling.nextElementSibling;
          seen += 1;
          continue;
        }
        // Never borrow text from a neighbouring field group. Without this,
        // "Total Professional Experience" would pick up the label of the
        // next section and vice versa. A direct control sibling (the first
        // select of a two-select pair) is skipped instead.
        if (containsControls(sibling)) {
          const isControl = sibling.matches(
            "input, select, textarea, [role='combobox'], [contenteditable='true'], [contenteditable=''], [role='textbox']"
          );
          if (!isControl) return out;
        } else if (!sibling.matches("input, select, textarea, button, [role='combobox'], [role='listbox']")) {
          if (
            direction === "next" &&
            sibling.tagName === "LABEL" &&
            sibling.htmlFor &&
            sibling.htmlFor !== el.id
          ) {
            // This label belongs to the next field in the row.
            return out;
          }
          const text = textOf(sibling);
          if (text.trim()) out.push(text);
        }
        sibling = direction === "previous" ? sibling.previousElementSibling : sibling.nextElementSibling;
        seen += 1;
      }
      node = node.parentElement;
      hops += 1;
      if (!node || /^(FORM|BODY|HTML)$/i.test(node.tagName)) break;
    }
    return out;
  };

  const visibleControlsIn = (container) => {
    if (!container) return [];
    let controls = Array.from(container.querySelectorAll(CONTROL_SELECTOR));
    controls = controls.filter((control) => isVisible(control) && !control.disabled && !control.readOnly);
    // A combobox wrapper can contain its own input. Keep the innermost control.
    return controls.filter((control) => {
      return !controls.some((other) => other !== control && control.contains(other));
    });
  };

  // Some component libraries (Vuetify/Material, for example) render the
  // question as a plain <label> with no `for`, in a wrapper that also holds
  // the control, and point aria-labelledby at an id that is never rendered.
  // Look for that label in the wrapper chain, but only while the wrapper
  // owns a single control so we never borrow the next question.
  const ownLabel = (el, node) => {
    let labels = [];
    try {
      labels = Array.from(node.querySelectorAll("label"));
    } catch (_) {
      return null;
    }
    for (const label of labels) {
      if (!isVisible(label) || label.contains(el)) continue;
      const forId = label.htmlFor;
      if (!forId) return label;
      if (forId === el.id) return label;
      const target = document.getElementById(forId);
      if (!target || target === el) return label;
      // `for` points at another control in the same wrapper: not ours.
    }
    return null;
  };

  const fieldGroupLabel = (el) => {
    let node = el.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1) {
      if (/^(FORM|BODY|HTML)$/i.test(node.tagName)) break;
      const controls = visibleControlsIn(node);
      if (controls.length > 1) break;
      const label = ownLabel(el, node);
      if (label) return label;
      node = node.parentElement;
    }
    return null;
  };

  // A <select> sometimes has its question rendered as plain text (a span or
  // div) instead of a <label>. When nothing better was found, use the closest
  // wrapper that owns this select as the question.
  const fieldGroupText = (el) => {
    if (!el.matches || !el.matches("select")) return null;
    let node = el.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1) {
      if (/^(FORM|BODY|HTML)$/i.test(node.tagName)) break;
      const controls = visibleControlsIn(node);
      if (controls.length > 1) break;
      const text = clean(textOf(node));
      if (text && text.length >= 3 && !looksLikeHelperText(text)) return text;
      node = node.parentElement;
    }
    return null;
  };

  // A radio/checkbox group has no single control to attach the question to:
  // the option labels belong to each input, and the question sits in a
  // sibling label without `for` above the group. Walk up until the wrapper
  // that holds the whole group and use that question.
  const groupQuestionLabel = (el) => {
    if (!el.matches || !el.matches('input[type="checkbox"], input[type="radio"]')) return null;
    let node = el.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1) {
      if (/^(FORM|BODY|HTML)$/i.test(node.tagName)) break;
      const controls = visibleControlsIn(node);
      if (controls.length > 12) break;
      let labels = [];
      try {
        labels = Array.from(node.querySelectorAll("label"));
      } catch (_) {
        labels = [];
      }
      for (const label of labels) {
        if (!isVisible(label) || label.contains(el)) continue;
        if (!label.htmlFor) return label;
      }
      node = node.parentElement;
    }
    return null;
  };

  const groupInfo = (el) => {
    let node = el.parentElement;
    let depth = 0;
    while (node && depth < 4 && !/^(FORM|BODY|HTML)$/i.test(node.tagName)) {
      const controls = visibleControlsIn(node);
      if (controls.length >= 2 && controls.length <= 8) {
        const index = controls.indexOf(el);
        return {
          index: index >= 0 ? index : 0,
          count: controls.length,
          text: clean(textOf(node))
        };
      }
      node = node.parentElement;
      depth += 1;
    }
    return { index: 0, count: 1, text: "" };
  };

  const optionsOf = (el) => {
    if (!el || el.tagName !== "SELECT") return [];
    return Array.from(el.options)
      .filter((option) => !option.disabled)
      .map((option) => ({
        text: collapse(option.textContent),
        value: option.value,
        disabled: option.disabled
      }))
      .filter((option) => option.text || option.value)
      .slice(0, 300);
  };

  const displayValue = (el) => {
    if (!el) return "";
    if (el.matches && el.matches('input[type="checkbox"], input[type="radio"]')) {
      return el.checked ? "Yes" : "";
    }
    if (el.tagName === "SELECT") {
      const option = el.options && el.options[el.selectedIndex];
      const text = option ? collapse(option.textContent) : "";
      if (!text || /^(select|choose|please select|selecione|escolha)\b/i.test(text)) return "";
      return text;
    }
    if (isEditable(el)) return clean(el.textContent);
    const value = el.value != null ? String(el.value) : clean(el.textContent);
    return value.trim();
  };

  const isEditable = (el) =>
    Boolean(
      el &&
        (el.isContentEditable ||
          el.getAttribute?.("contenteditable") === "true" ||
          el.getAttribute?.("contenteditable") === "")
    );

  const buildContext = (el) => {
    const host =
      el.matches && el.matches('[role="combobox"]')
        ? el
        : (el.closest && el.closest('[role="combobox"]')) || el;

    const labels = [];
    explicitLabels(el, host, labels);

    const fieldLabel = fieldGroupLabel(el);
    if (fieldLabel) addCandidate(labels, textOf(fieldLabel), 0.9, "field-label");

    const questionLabel = groupQuestionLabel(el);
    if (questionLabel) addCandidate(labels, textOf(questionLabel), 0.92, "group-question");

    const editable = isEditable(el);
    const previousTexts = neighbourTexts(host, "previous", 1);
    if (previousTexts.length) {
      addCandidate(labels, previousTexts[0], editable ? 0.94 : 0.82, "previous-text");
    }
    const nextTexts = neighbourTexts(host, "next", 2);
    if (nextTexts.length) {
      addCandidate(labels, nextTexts[0], editable ? 0.72 : 0.88, "next-text");
      // Helper text (a URL, "strength", "optional", …) sometimes sits between
      // the control and the real caption below it. Use the following text as
      // a weaker label only in that case.
      if (nextTexts.length > 1 && looksLikeHelperText(nextTexts[0])) {
        addCandidate(labels, nextTexts[1], editable ? 0.66 : 0.74, "next-text-fallback");
      }
    }

    // Last resort for native selects whose question is plain text.
    if (!labels.some((item) => item.weight >= 0.8)) {
      const groupText = fieldGroupText(el);
      if (groupText) addCandidate(labels, groupText, 0.7, "field-text");
    }

    const group = groupInfo(el);
    if (group.text && group.text.length <= 130) {
      addCandidate(labels, group.text, 0.62, "row-text");
    }

    const legend = el.closest && el.closest("fieldset");
    if (legend) {
      const legendText = legend.querySelector("legend");
      if (legendText) addCandidate(labels, textOf(legendText), 0.8, "legend");
    }

    const groupContainer =
      el.closest && el.closest('[role="radiogroup"], [role="group"], [data-field-group]');
    if (groupContainer) {
      const groupLabelledBy = groupContainer.getAttribute("aria-labelledby");
      if (groupLabelledBy) {
        for (const id of groupLabelledBy.split(/\s+/)) {
          const target = id && document.getElementById(id);
          if (target) addCandidate(labels, textOf(target), 0.92, "group-label");
        }
      }
      const groupLabel = groupContainer.getAttribute("aria-label");
      if (groupLabel) addCandidate(labels, groupLabel, 0.92, "group-label");
    }

    // Container headings are useful for unlabelled custom widgets.
    let ancestor = el.parentElement;
    for (let depth = 0; ancestor && depth < 4; depth += 1) {
      const heading = ancestor.querySelector("h1, h2, h3, h4, h5, h6, [role='heading']");
      if (heading && !heading.contains(el)) {
        const headingText = clean(textOf(heading));
        if (headingText && headingText.length < 90) addCandidate(labels, headingText, 0.55, "heading");
        break;
      }
      ancestor = ancestor.parentElement;
    }

    labels.sort((a, b) => b.weight - a.weight);

    const options = optionsOf(el);
    return {
      el,
      host,
      labels,
      text: labels.map((item) => norm(item.text)).join(" "),
      nameString: tokensOf(el),
      autocomplete: autocompleteOf(el),
      group,
      options,
      optionsText: norm(options.map((option) => `${option.text} ${option.value}`).join(" ")),
      tagName: el.tagName,
      type: (el.getAttribute && el.getAttribute("type")) || "",
      isSelect: el.tagName === "SELECT",
      isCheckbox: el.matches && el.matches('input[type="checkbox"]'),
      isRadio: el.matches && el.matches('input[type="radio"]'),
      isContentEditable: isEditable(el),
      isCombobox:
        Boolean(el.matches && el.matches('[role="combobox"], [aria-haspopup="listbox"]')) ||
        Boolean(host !== el && host.matches('[role="combobox"]')),
      isFile: Boolean(el.matches && el.matches('input[type="file"]')),
      readOnly: Boolean(el.readOnly),
      required:
        Boolean(el.required) ||
        el.getAttribute("aria-required") === "true" ||
        labels.some((item) => /(^|\s)\*/.test(item.text)),
      currentValue: displayValue(el),
      label: labels.length ? labels[0].text : "",
      allLabelTexts: labels.map((item) => item.text)
    };
  };

  window.JALabels = {
    CONTROL_SELECTOR,
    buildContext,
    clean,
    collapse,
    displayValue,
    groupInfo,
    isEditable,
    isUsable,
    isVisible,
    optionsOf,
    setVisibilityCheck,
    textOf,
    tokensOf
  };
})();
