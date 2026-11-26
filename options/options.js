/**
 * Options page: a single career profile with autosave, repeatable
 * sections, JSON import/export and an example profile.
 */
"use strict";
(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const { DEFAULT_PROFILE, merge, resolvePath, setPath } = window.JAProfile;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let loaded = merge(DEFAULT_PROFILE, {});
  let saveTimer = null;
  let saveVersion = 0;

  const LIST_KINDS = ["experience", "education", "languages", "answers"];

  /* ------------------------------------------------------------------ */
  /* Save state                                                          */
  /* ------------------------------------------------------------------ */

  const setSaveState = (state, label) => {
    const el = $("#saveState");
    if (!el) return;
    el.dataset.state = state;
    el.innerHTML = "";
    const dot = document.createElement("i");
    el.append(dot, document.createTextNode(label));
  };

  /* ------------------------------------------------------------------ */
  /* Reading / writing the form                                          */
  /* ------------------------------------------------------------------ */

  const readControl = (el) => {
    if (el.type === "checkbox") return el.checked;
    return el.value ?? "";
  };

  const applyProfile = (profile) => {
    loaded = merge(DEFAULT_PROFILE, profile);
    for (const el of $$("[data-path]")) {
      const path = el.dataset.path;
      const value = resolvePath(loaded, path);
      if (el.type === "checkbox") el.checked = Boolean(value);
      else el.value = value == null ? "" : String(value);
    }
    renderLists();
    updateCompleteness();
  };

  const collectRows = (kind) => {
    const container = $(`[data-list="${kind}"]`);
    if (!container) return [];
    const items = [];
    for (const row of $$(".repeat-row", container)) {
      const item = {};
      for (const field of $$("[data-field]", row)) {
        const value = field.type === "checkbox" ? field.checked : field.value.trim();
        item[field.dataset.field] = value;
      }
      const useful =
        kind === "experience"
          ? item.company || item.title
          : kind === "education"
            ? item.school || item.degree
            : kind === "languages"
              ? item.language
              : false;
      if (useful) items.push(item);
    }
    return items;
  };

  const collectAnswers = () => {
    const container = $('[data-list="answers"]');
    const map = {};
    if (!container) return map;
    for (const row of $$(".repeat-row", container)) {
      const key = $('[data-field="key"]', row)?.value.trim();
      const value = $('[data-field="value"]', row)?.value.trim();
      if (key && value) map[key] = value;
    }
    return map;
  };

  const collect = () => {
    const next = merge(DEFAULT_PROFILE, {});
    for (const el of $$("[data-path]")) {
      setPath(next, el.dataset.path, readControl(el));
    }
    next.experience = collectRows("experience");
    next.education = collectRows("education");
    next.languages = collectRows("languages");
    next.customAnswers = collectAnswers();
    return next;
  };

  /* ------------------------------------------------------------------ */
  /* Repeatable sections                                                 */
  /* ------------------------------------------------------------------ */

  const rowTitle = (kind, item, index) => {
    if (kind === "experience") return item.company || item.title || `Previous role ${index + 1}`;
    if (kind === "education") return item.school || item.degree || `Education ${index + 1}`;
    if (kind === "languages") return item.language || `Language ${index + 1}`;
    if (kind === "answers") return item.key || `Saved answer ${index + 1}`;
    return "Row";
  };

  const updateRowTitles = () => {
    for (const kind of LIST_KINDS) {
      const container = $(`[data-list="${kind}"]`);
      if (!container) continue;
      $$(".repeat-row", container).forEach((row, index) => {
        const title = $('[data-role="row-title"]', row);
        if (!title) return;
        const item = {};
        for (const field of $$("[data-field]", row)) {
          item[field.dataset.field] = field.type === "checkbox" ? field.checked : field.value;
        }
        title.textContent = rowTitle(kind, item, index);
      });
    }
  };

  const renderEmptyState = (kind) => {
    const container = $(`[data-list="${kind}"]`);
    if (!container) return;
    const existing = $(".rows-empty", container.parentElement);
    const hasRows = Boolean($(".repeat-row", container));
    if (existing) existing.remove();
    if (hasRows) return;
    const note = document.createElement("p");
    note.className = "muted small rows-empty";
    note.style.margin = "0 0 12px";
    note.textContent =
      kind === "experience"
        ? "No previous roles yet. The current role above is used first."
        : kind === "education"
          ? "No education added yet."
          : kind === "languages"
            ? "No languages added yet."
            : "No saved answers yet.";
    container.parentElement.insertBefore(note, container.nextSibling);
  };

  const addRow = (kind, data = {}) => {
    const container = $(`[data-list="${kind}"]`);
    const templateId = kind === "answers" ? "template-answer" : kind === "languages" ? "template-language" : `template-${kind}`;
    const template = document.getElementById(templateId);
    if (!container || !template) return null;
    const node = template.content.firstElementChild.cloneNode(true);
    for (const field of $$("[data-field]", node)) {
      const key = field.dataset.field;
      const value = data[key];
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value == null ? "" : String(value);
    }
    $('[data-role="remove"]', node).addEventListener("click", () => {
      node.remove();
      renderEmptyState(kind);
      updateRowTitles();
      scheduleSave();
    });
    container.appendChild(node);
    updateRowTitles();
    renderEmptyState(kind);
    return node;
  };

  const renderLists = () => {
    for (const kind of LIST_KINDS) {
      const container = $(`[data-list="${kind}"]`);
      if (!container) continue;
      container.innerHTML = "";
      if (kind === "answers") {
        for (const [key, value] of Object.entries(loaded.customAnswers || {})) {
          addRow("answers", { key, value });
        }
      } else {
        const items = Array.isArray(loaded[kind]) ? loaded[kind] : [];
        for (const item of items) addRow(kind, item);
      }
      renderEmptyState(kind);
    }
    updateRowTitles();
  };

  /* ------------------------------------------------------------------ */
  /* Completeness                                                        */
  /* ------------------------------------------------------------------ */

  const updateCompleteness = () => {
    let stats;
    try {
      stats = window.JAProfile.completeness(collect());
    } catch (_) {
      stats = { percent: 0, missing: [] };
    }
    const value = $("#completenessValue");
    const bar = $("#completenessBar");
    const hint = $("#completenessHint");
    const missing = $("#completenessMissing");
    if (value) value.textContent = `${stats.percent}%`;
    if (bar) bar.style.width = `${stats.percent}%`;
    if (hint) {
      hint.textContent =
        stats.percent >= 90
          ? "Looks good. You are ready to apply."
          : stats.percent >= 50
            ? "Enough for most forms. Add the rest for better matches."
            : "Fill the basics to enable auto-fill.";
    }
    if (missing) {
      missing.innerHTML = "";
      for (const item of stats.missing.slice(0, 6)) {
        const li = document.createElement("li");
        li.textContent = item;
        missing.appendChild(li);
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /* Autosave                                                            */
  /* ------------------------------------------------------------------ */

  const saveNow = async ({ announce = true } = {}) => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const version = ++saveVersion;
    const profile = collect();
    if (announce) setSaveState("saving", "Saving…");
    try {
      const saved = await window.JAProfile.save(profile);
      if (version === saveVersion) {
        loaded = saved;
        if (announce) setSaveState("saved", "Saved");
      }
      return saved;
    } catch (error) {
      console.error("[Job Autofill] Could not save profile", error);
      if (announce) setSaveState("error", "Not saved");
      return null;
    }
  };

  function scheduleSave() {
    updateRowTitles();
    updateCompleteness();
    setSaveState("saving", "Saving…");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveNow();
    }, 600);
  }

  /* ------------------------------------------------------------------ */
  /* Import / export                                                     */
  /* ------------------------------------------------------------------ */

  const exportProfile = () => {
    const profile = collect();
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `job-autofill-profile-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const importProfile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const profile = data && data.profile ? data.profile : data;
      if (!profile || typeof profile !== "object") throw new Error("Not a profile file");
      applyProfile(profile);
      await saveNow();
      setSaveState("saved", "Imported");
    } catch (error) {
      setSaveState("error", "Invalid file");
      alert(`Could not import this file: ${error.message}`);
    }
  };

  const loadExample = async () => {
    try {
      if (!window.JAProfile.isProfileEmpty(collect())) {
        if (!confirm("Replace the current profile with the example profile?")) return;
      }
      const response = await fetch(api.runtime.getURL("samples/profile.example.json"));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      applyProfile(data);
      await saveNow();
      setSaveState("saved", "Example loaded");
    } catch (error) {
      setSaveState("error", "Could not load example");
      alert(`Could not load the example profile: ${error.message}`);
    }
  };

  const clearProfile = async () => {
    if (!confirm("Delete all profile data from this browser? This cannot be undone.")) return;
    applyProfile(merge(DEFAULT_PROFILE, {}));
    await saveNow();
    setSaveState("saved", "Cleared");
  };

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  const wire = () => {
    document.addEventListener("input", (event) => {
      if (event.target.matches("[data-path], [data-field]")) scheduleSave();
    });
    document.addEventListener("change", (event) => {
      if (event.target.matches("[data-path], [data-field]")) scheduleSave();
    });

    for (const button of $$("[data-add]")) {
      button.addEventListener("click", () => {
        const kind = button.dataset.add;
        const row = addRow(kind);
        scheduleSave();
        if (row) {
          const first = $("[data-field]", row);
          if (first) first.focus();
        }
      });
    }

    $("#exportProfile").addEventListener("click", exportProfile);
    $("#importFile").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      importProfile(file).finally(() => {
        event.target.value = "";
      });
    });
    $("#loadExample").addEventListener("click", loadExample);
    $("#clearProfile").addEventListener("click", clearProfile);

    window.addEventListener("beforeunload", () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveNow({ announce: false });
      }
    });

    // Ctrl/Cmd+S saves immediately instead of opening the browser's dialog.
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveNow();
      }
    });
  };

  const boot = async () => {
    wire();
    try {
      const profile = await window.JAProfile.load();
      applyProfile(profile);
      updateCompleteness();
      setSaveState("saved", "Saved");
      if (window.JAProfile.isProfileEmpty(profile)) {
        setSaveState("saved", "Add your details");
      }
    } catch (error) {
      console.error("[Job Autofill] Could not load profile", error);
      applyProfile(merge(DEFAULT_PROFILE, {}));
      setSaveState("error", "Load failed");
    }
  };

  boot();
})();
