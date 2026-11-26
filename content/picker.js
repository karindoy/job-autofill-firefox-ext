/**
 * Mouse-only fallback: a small in-page panel that lets the user click
 * any field and choose one of the saved values (or type a new one).
 *
 * It lives in a shadow root so job-board CSS cannot break it.
 */
"use strict";
(() => {
  if (window.JAPicker) return;
  let host = null;
  let shadow = null;
  let panel = null;
  let launcher = null;
  let active = false;
  let current = null;
  let hovered = null;
  let pointerOrigin = null;
  let lastPickAt = 0;
  let styleElement = null;
  let lastStatusTimer = null;
  let allCatalog = [];

  const css = `
    :host { all: initial; }
    [hidden] { display: none !important; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .panel {
      position: fixed; right: 18px; bottom: 18px; width: 360px; max-width: calc(100vw - 24px);
      background: #0f172a; color: #e2e8f0; border: 1px solid rgba(148, 163, 184, .35);
      border-radius: 14px; box-shadow: 0 22px 60px rgba(2, 6, 23, .45);
      overflow: hidden; z-index: 2147483647; font-size: 13px;
    }
    .panel[hidden], .launcher[hidden] { display: none !important; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 11px 13px; background: linear-gradient(135deg, #1d4ed8, #6d28d9); }
    .title { font-weight: 700; font-size: 13px; letter-spacing: .2px; display: flex; align-items: center; gap: 7px; }
    .bolt { font-size: 15px; }
    .close { border: 0; background: rgba(255,255,255,.16); color: #fff; width: 26px; height: 26px; border-radius: 7px; cursor: pointer; font-size: 13px; line-height: 1; }
    .close:hover { background: rgba(255,255,255,.28); }
    .body { padding: 12px 13px 13px; max-height: min(70vh, 560px); overflow-y: auto; }
    .hint { color: #94a3b8; font-size: 12px; line-height: 1.45; margin: 0 0 10px; }
    .field-card { background: rgba(148,163,184,.1); border: 1px solid rgba(148,163,184,.18); border-radius: 9px; padding: 9px 10px; margin-bottom: 10px; }
    .field-label { font-weight: 650; color: #f1f5f9; font-size: 13px; line-height: 1.3; word-break: break-word; }
    .field-meta { color: #94a3b8; font-size: 11px; margin-top: 4px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .tag { background: rgba(59,130,246,.18); color: #93c5fd; border-radius: 99px; padding: 1px 7px; font-size: 10px; }
    .tag.ready { background: rgba(34,197,94,.16); color: #86efac; }
    .tag.custom { background: rgba(168,85,247,.18); color: #d8b4fe; }
    input[type="text"], input[type="search"] {
      width: 100%; background: #111c31; color: #e2e8f0; border: 1px solid rgba(148,163,184,.32);
      border-radius: 8px; padding: 8px 9px; font-size: 12.5px; outline: none;
    }
    input:focus { border-color: #60a5fa; box-shadow: 0 0 0 2px rgba(96,165,250,.22); }
    .search { margin-bottom: 8px; }
    .list { display: flex; flex-direction: column; gap: 4px; max-height: 230px; overflow-y: auto; margin: 0 0 9px; padding-right: 2px; }
    .option { display: flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; border: 1px solid transparent; background: rgba(148,163,184,.08); color: #e2e8f0; border-radius: 7px; padding: 7px 8px; cursor: pointer; font-size: 12px; line-height: 1.35; }
    .option:hover { background: rgba(96,165,250,.18); border-color: rgba(96,165,250,.35); }
    .option .grow { flex: 1; min-width: 0; }
    .option .opt-label { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .option .opt-value { color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
    .option .opt-group { color: #64748b; font-size: 9.5px; text-transform: uppercase; letter-spacing: .4px; white-space: nowrap; }
    .empty { color: #94a3b8; font-size: 12px; padding: 8px 2px; }
    .custom-row { display: flex; gap: 6px; margin-top: 2px; }
    .custom-row input { flex: 1; }
    button.primary { background: #2563eb; color: white; border: 0; border-radius: 8px; padding: 8px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    button.primary:hover { background: #1d4ed8; }
    button.ghost { background: rgba(148,163,184,.12); color: #cbd5e1; border: 1px solid rgba(148,163,184,.25); border-radius: 8px; padding: 7px 10px; font-size: 12px; cursor: pointer; }
    button.ghost:hover { background: rgba(148,163,184,.2); }
    .remember { display: flex; gap: 6px; align-items: center; color: #94a3b8; font-size: 11.5px; margin-top: 9px; cursor: pointer; }
    .remember input { accent-color: #2563eb; }
    footer { display: flex; justify-content: space-between; gap: 8px; margin-top: 11px; padding-top: 10px; border-top: 1px solid rgba(148,163,184,.16); }
    .status { margin-top: 8px; font-size: 11.5px; min-height: 14px; color: #86efac; line-height: 1.35; }
    .status.error { color: #fca5a5; }
    .kbd { background: rgba(148,163,184,.15); border: 1px solid rgba(148,163,184,.25); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; font-size: 10px; }
    .launcher {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
      background: linear-gradient(135deg, #1d4ed8, #6d28d9); color: #fff; border: 0;
      border-radius: 999px; padding: 9px 13px; font-size: 12.5px; font-weight: 700; cursor: pointer;
      box-shadow: 0 10px 28px rgba(30, 64, 175, .38); display: flex; align-items: center; gap: 6px;
    }
    .launcher:hover { transform: translateY(-1px); }
    @media (max-width: 480px) {
      .panel { right: 8px; left: 8px; bottom: 8px; width: auto; }
      .list { max-height: 34vh; }
    }
  `;

  const hoverCss = `
    .__ja_hover_field {
      outline: 2px solid #22c55e !important;
      outline-offset: 2px !important;
      background-color: rgba(34, 197, 94, 0.07) !important;
      cursor: crosshair !important;
    }
  `;

  const ensureStyleElement = () => {
    if (styleElement && styleElement.isConnected) return;
    styleElement = document.createElement("style");
    styleElement.textContent = hoverCss;
    (document.head || document.documentElement).appendChild(styleElement);
  };

  const removeHover = () => {
    if (hovered && hovered.classList) hovered.classList.remove("__ja_hover_field");
    hovered = null;
  };

  const setHover = (el) => {
    if (el === hovered) return;
    removeHover();
    if (el && el.classList) {
      el.classList.add("__ja_hover_field");
      hovered = el;
    }
  };

  const pointOf = (event) => {
    if (typeof event.clientX === "number" && typeof event.clientY === "number" && (event.clientX || event.clientY)) {
      return { x: event.clientX, y: event.clientY };
    }
    return null;
  };

  // A control sitting under the pointer. This catches clicks on wrappers,
  // helper text and padding that still visually belong to a field.
  const controlAtPoint = (point) => {
    if (!point || typeof document.elementsFromPoint !== "function") return null;
    let nodes = [];
    try {
      nodes = document.elementsFromPoint(point.x, point.y) || [];
    } catch (_) {
      return null;
    }
    for (const node of nodes) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
      const control = node.matches?.(window.JALabels.CONTROL_SELECTOR)
        ? node
        : node.closest?.(window.JALabels.CONTROL_SELECTOR);
      if (control && window.JALabels.isVisible(control)) return control;
    }
    return null;
  };

  // Closest control within the surrounding field group. Bounded so clicking
  // the modal background cannot grab an arbitrary input from the dialog.
  const nearestControl = (target, point) => {
    let node = target.parentElement;
    for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
      if (/^(BODY|HTML)$/i.test(node.tagName)) break;
      const controls = Array.from(node.querySelectorAll(window.JALabels.CONTROL_SELECTOR)).filter((el) =>
        window.JALabels.isVisible(el)
      );
      if (!controls.length) continue;
      if (controls.length === 1) return controls[0];
      if (controls.length > 6) break; // whole form/dialog: too broad
      if (!point) return controls[0];
      let best = null;
      let bestDistance = Infinity;
      for (const control of controls) {
        const rect = control.getBoundingClientRect();
        const distance = Math.hypot(rect.left + rect.width / 2 - point.x, rect.top + rect.height / 2 - point.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = control;
        }
      }
      return best;
    }
    return null;
  };

  const fieldFromEvent = (event) => {
    const path = event.composedPath ? event.composedPath() : [];
    if (path.includes(host)) return null;
    let target = event.target;
    if (!target || target.nodeType !== Node.ELEMENT_NODE) {
      target = target && target.parentElement;
    }
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;
    // Dropdowns and menus belong to the page (LinkedIn's location, company
    // and school typeaheads). Never hijack clicks on their options.
    if (target.closest?.('[role="listbox"], [role="option"], [role="menu"], [role="menuitem"]')) return null;
    if (target.closest?.(".__ja_hover_field")) target = target.closest(".__ja_hover_field");
    const control = target.closest?.(window.JALabels.CONTROL_SELECTOR);
    if (control) return control;
    const label = target.closest?.("label");
    if (label) {
      if (label.control) return label.control;
      const inside = label.querySelector(window.JALabels.CONTROL_SELECTOR);
      if (inside) return inside;
      const forId = label.getAttribute("for");
      if (forId) {
        const byFor = document.getElementById(forId);
        if (byFor && byFor.matches?.(window.JALabels.CONTROL_SELECTOR)) return byFor;
      }
    }
    const point = pointOf(event);
    return controlAtPoint(point) || nearestControl(target, point);
  };

  const h = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "text") node.textContent = value;
      else if (key === "class") node.className = value;
      else if (key === "hidden") node.hidden = Boolean(value);
      else if (key === "checked") node.checked = Boolean(value);
      else node.setAttribute(key, value);
    }
    for (const child of children) {
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  };

  const buildPanel = () => {
    const style = document.createElement("style");
    style.textContent = css;

    const close = h("button", { class: "close", type: "button", title: "Close (Esc)", text: "✕" });
    const header = h("header", {}, [
      h("div", { class: "title" }, [
        h("span", { class: "bolt", text: "⚡" }),
        h("span", { text: "Job Autofill" })
      ]),
      close
    ]);

    const fieldCard = h("div", { class: "field-card", hidden: true }, [
      h("div", { class: "field-label" }),
      h("div", { class: "field-meta" })
    ]);
    const search = h("input", {
      class: "search",
      type: "text",
      placeholder: "Search saved values…",
      autocomplete: "off",
      spellcheck: "false"
    });
    const list = h("div", { class: "list" });
    const custom = h("input", {
      class: "custom",
      type: "text",
      placeholder: "Or type a value…",
      autocomplete: "off",
      spellcheck: "false"
    });
    const fillCustom = h("button", { class: "primary fill-custom", type: "button", text: "Fill" });
    const rememberCheck = h("input", { type: "checkbox", class: "remember-check" });
    const remember = h("label", { class: "remember" }, [
      rememberCheck,
      "Save as answer for this field"
    ]);
    const status = h("div", { class: "status", role: "status" });
    const fillPage = h("button", { class: "ghost fill-page", type: "button", text: "Fill this page" });
    const done = h("button", { class: "ghost close-2", type: "button", text: "Done" });

    const body = h("div", { class: "body" }, [
      h("p", { class: "hint", text: "Click any field on the page to see your saved values, or hover a field and press Enter. Everything stays in this browser." }),
      fieldCard,
      search,
      list,
      h("div", { class: "custom-row" }, [custom, fillCustom]),
      remember,
      status,
      h("footer", {}, [fillPage, done])
    ]);

    panel = h("div", { class: "panel", hidden: true }, [header, body]);
    launcher = h("button", {
      class: "launcher",
      type: "button",
      hidden: true,
      title: "Open the value picker (Alt+Shift+P)"
    }, [h("span", { text: "⚡" }), h("span", { text: "Autofill" })]);

    shadow.append(style, panel, launcher);

    close.addEventListener("click", hide);
    done.addEventListener("click", hide);
    fillPage.addEventListener("click", async () => {
      setStatus("Filling…");
      const result = await window.JAFiller.fillPage({ overwrite: false });
      setStatus(`Filled ${result.filled} field${result.filled === 1 ? "" : "s"}.`);
      refreshCurrentField();
    });
    search.addEventListener("input", () => renderSuggestions());
    fillCustom.addEventListener("click", () => {
      const value = custom.value.trim();
      if (value) applyValue(value);
    });
    custom.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const value = event.target.value.trim();
        if (value) applyValue(value);
      }
    });
    launcher.addEventListener("click", () => show());
  };

  const ensureHost = () => {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.id = "ja-autofill-root";
    host.style.setProperty("all", "initial");
    shadow = host.attachShadow({ mode: "open" });
    buildPanel();
    (document.documentElement || document.body).appendChild(host);
    ensureStyleElement();
  };

  const setStatus = (message, isError = false) => {
    if (!shadow) return;
    const status = shadow.querySelector(".status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", Boolean(isError));
    if (lastStatusTimer) clearTimeout(lastStatusTimer);
    if (message && !isError) {
      lastStatusTimer = setTimeout(() => {
        if (status.textContent === message) status.textContent = "";
      }, 6000);
    }
  };

  const renderField = () => {
    const card = shadow.querySelector(".field-card");
    const label = shadow.querySelector(".field-label");
    const meta = shadow.querySelector(".field-meta");
    if (!current) {
      card.hidden = true;
      label.textContent = "";
      meta.textContent = "";
      return;
    }
    card.hidden = false;
    label.textContent = current.description.label || "Field";
    meta.innerHTML = "";
    const kind = document.createElement("span");
    kind.className = "tag";
    kind.textContent = current.description.kind;
    meta.appendChild(kind);
    if (current.description.ruleId) {
      const rule = document.createElement("span");
      rule.className = "tag";
      rule.textContent =
        current.description.source === "custom" ? "saved answer" : "matched";
      meta.appendChild(rule);
    }
    if (current.description.status === "filled") {
      const filled = document.createElement("span");
      filled.className = "tag ready";
      filled.textContent = "already filled";
      meta.appendChild(filled);
    }
    if (current.description.required) {
      const required = document.createElement("span");
      required.className = "tag";
      required.textContent = "required";
      meta.appendChild(required);
    }
  };

  const catalogEntries = () => {
    const profile = window.JAFiller.getProfile();
    if (!profile) return [];
    try {
      allCatalog = window.JAProfile.catalog(profile);
    } catch (_) {
      allCatalog = [];
    }
    return allCatalog;
  };

  const renderSuggestions = () => {
    const list = shadow.querySelector(".list");
    if (!list) return;
    list.innerHTML = "";
    if (!current) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Pick a field first.";
      list.appendChild(empty);
      return;
    }
    const query = (shadow.querySelector(".search").value || "").trim().toLowerCase();
    const seen = new Set();
    const options = [];

    for (const suggestion of current.description.suggestions || []) {
      const value = String(suggestion.value || "");
      if (!value) continue;
      const key = `${suggestion.label}|${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        label: suggestion.label || value,
        value,
        group: suggestion.group || "Suggested"
      });
    }
    const normalize = window.JAProfile.normalizeText;
    const labelTokens = new Set(
      normalize(current.description.label || "").split(" ").filter((token) => token.length > 2)
    );
    const ruleKey = String(current.description.ruleId || "").split(".").pop().toLowerCase();
    const relevance = (entry) => {
      let score = 0;
      const label = normalize(entry.label || "");
      if (label && label === normalize(current.description.label || "")) score += 100;
      for (const token of labelTokens) if (label.includes(token)) score += 12;
      if (ruleKey && entry.path && String(entry.path).toLowerCase().includes(ruleKey)) score += 8;
      if (entry.group === "Saved answers") score -= 5;
      return score;
    };
    const ordered = [...catalogEntries()].sort((a, b) => relevance(b) - relevance(a));
    for (const entry of ordered) {
      const key = `${entry.label}|${entry.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ label: entry.label, value: entry.value, group: entry.group });
    }

    const filtered = options
      .filter((option) => {
        if (!query) return true;
        return `${option.label} ${option.value} ${option.group}`.toLowerCase().includes(query);
      })
      .slice(0, 100);

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No saved value matches. Type it below.";
      list.appendChild(empty);
      return;
    }

    for (const option of filtered) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.title = option.value;
      const grow = document.createElement("span");
      grow.className = "grow";
      const labelSpan = document.createElement("span");
      labelSpan.className = "opt-label";
      labelSpan.textContent = option.label;
      const valueSpan = document.createElement("span");
      valueSpan.className = "opt-value";
      valueSpan.textContent = option.value;
      grow.append(labelSpan, valueSpan);
      const groupSpan = document.createElement("span");
      groupSpan.className = "opt-group";
      groupSpan.textContent = option.group || "";
      button.append(grow, groupSpan);
      button.addEventListener("click", () => applyValue(option.value));
      list.appendChild(button);
    }
  };

  const refreshCurrentField = () => {
    if (!current) return;
    const element = current.record.el;
    if (!element || !element.isConnected) {
      current = null;
      renderField();
      renderSuggestions();
      return;
    }
    try {
      const next = window.JAFiller.findFieldForElement(element);
      if (next) current = next;
    } catch (_) {
      /* ignore */
    }
    renderField();
    renderSuggestions();
  };

  const selectField = (element) => {
    if (!element) return;
    try {
      const found = window.JAFiller.findFieldForElement(element);
      if (!found) {
        setStatus("This element is not a form field.", true);
        return;
      }
      current = found;
      shadow.querySelector(".field-card").hidden = false;
      shadow.querySelector(".search").value = "";
      shadow.querySelector(".custom").value = "";
      renderField();
      renderSuggestions();
      setStatus("");
    } catch (error) {
      setStatus("Could not read this field.", true);
    }
  };

  const saveAnswer = async (value) => {
    const profile = window.JAFiller.getProfile();
    if (!profile || !current) return;
    const keyText = current.description.contextLabel || current.description.label || "";
    const key = window.JAProfile.customKey(keyText);
    if (!key || !value) return;
    const latest = await window.JAProfile.load();
    latest.customAnswers[key] = String(value);
    const saved = await window.JAProfile.save(latest);
    window.JAFiller.setProfile(saved);
    setStatus(`Saved as “${key}” for future forms.`);
  };

  const applyValue = async (value) => {
    if (!current) {
      setStatus("Pick a field first.", true);
      return;
    }
    if (!value || !String(value).trim()) {
      setStatus("Type a value first.", true);
      return;
    }
    setStatus("Filling…");
    try {
      const result = await window.JAFiller.fillById(current.description.id, value);
      if (result && result.ok) {
        const remember = shadow.querySelector(".remember-check").checked;
        if (remember) await saveAnswer(value);
        else setStatus("Filled ✓");
        refreshCurrentField();
      } else {
        setStatus((result && (result.message || result.reason)) || "Could not fill this field.", true);
      }
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), true);
    }
  };

  const pickField = (field) => {
    if (!field) {
      setStatus("No form field under the cursor. Click inside the input itself.");
      return;
    }
    const now = Date.now();
    if (now - lastPickAt < 350) return;
    lastPickAt = now;
    selectField(field);
  };

  const onCapture = (event) => {
    if (!active) return;
    if (event.composedPath && event.composedPath().includes(host)) return;
    // Only clicks are observed here. pointerdown/mousedown must reach the
    // page so inputs keep focus and native comboboxes still open their
    // dropdowns; swallowing them makes the whole page feel unclickable.
    if (event.type !== "click") return;
    const field = fieldFromEvent(event);
    if (!field) return;
    // Stop a wrapping link from navigating, but let the event continue so
    // React/Vue handlers still see it (typeaheads open on click too).
    event.preventDefault();
    pickField(field);
  };

  // Some sites (and Firefox focus traps) swallow or retarget the click
  // event. Selecting on pointerup makes picking work even then.
  const onPointerDown = (event) => {
    if (!active) return;
    if (event.composedPath && event.composedPath().includes(host)) return;
    pointerOrigin = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event) => {
    if (!active || !pointerOrigin) return;
    const origin = pointerOrigin;
    pointerOrigin = null;
    if (event.composedPath && event.composedPath().includes(host)) return;
    if (typeof event.button === "number" && event.button !== 0) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) return;
    pickField(fieldFromEvent(event));
  };

  const onMove = (event) => {
    if (!active) return;
    if (event.composedPath && event.composedPath().includes(host)) {
      setHover(null);
      return;
    }
    const field = fieldFromEvent(event);
    setHover(field);
  };

  const onKey = (event) => {
    if (!active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
      return;
    }
    // Keyboard fallback: hover a field, press Enter. Useful when a site
    // swallows clicks (focus traps, overlays, pointer capture).
    if (event.key === "Enter" && hovered && hovered.isConnected) {
      const path = event.composedPath ? event.composedPath() : [];
      if (!path.includes(host)) {
        event.preventDefault();
        pickField(hovered);
      }
    }
  };

  const addListeners = () => {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("click", onCapture, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("keydown", onKey, true);
  };

  const removeListeners = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("click", onCapture, true);
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("keydown", onKey, true);
  };

  const show = () => {
    ensureHost();
    ensureStyleElement();
    active = true;
    current = null;
    panel.hidden = false;
    launcher.hidden = true;
    shadow.querySelector(".field-card").hidden = true;
    renderSuggestions();
    addListeners();
    setStatus("Click a field on the page to inspect it.");
  };

  const hide = () => {
    if (!host) return;
    active = false;
    removeHover();
    removeListeners();
    if (panel) panel.hidden = true;
    if (launcher) launcher.hidden = false;
  };

  const mountLauncher = () => {
    ensureHost();
    if (active) return;
    launcher.hidden = false;
  };

  const unmountLauncher = () => {
    if (launcher) launcher.hidden = true;
    if (active) hide();
  };

  const isActive = () => active;

  window.JAPicker = {
    show,
    hide,
    mountLauncher,
    unmountLauncher,
    isActive,
    selectField
  };
})();
