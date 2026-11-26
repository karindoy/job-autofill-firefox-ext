/**
 * Toolbar popup: page scan summary, one-click fill, per-field value
 * picker (mouse only) and the per-site auto-fill switch.
 */
"use strict";
(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const CONTENT_FILES = [
    "shared/profile.js",
    "content/labels.js",
    "content/rules.js",
    "content/filler.js",
    "content/picker.js",
    "content/content.js"
  ];

  const $ = (selector) => document.querySelector(selector);

  let tab = null;
  let profile = null;
  let scan = null;
  let catalog = [];
  let busy = false;
  const expanded = new Set();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const hasValue = (value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return true;
    return String(value ?? "").trim().length > 0;
  };

  const setStatus = (message, isError = false) => {
    const status = $("#status");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(isError));
  };

  const showError = ({ title = "Can't read this page", message = "", detail = "" } = {}) => {
    const box = $("#error");
    if (!box) return;
    $("#errorTitle").textContent = title;
    $("#errorText").textContent = message;
    const details = $("#errorDetails");
    const code = $("#errorDetail");
    if (code) code.textContent = detail ? String(detail) : "";
    if (details) {
      details.hidden = !detail;
      details.open = false;
    }
    box.hidden = false;
  };

  const hideError = () => {
    const box = $("#error");
    if (box) box.hidden = true;
  };

  const setLoading = (value) => {
    const loading = $("#loading");
    if (loading) loading.hidden = !value;
    const content = $("#content");
    if (content) content.setAttribute("aria-busy", String(Boolean(value)));
  };

  const hideLoading = () => setLoading(false);

  const setBusy = (value) => {
    busy = value;
    for (const id of ["#fillEmpty", "#fillAll", "#pickMode", "#refreshBtn", "#refreshBtn2"]) {
      const el = $(id);
      if (!el) continue;
      const needsProfile = id === "#fillEmpty" || id === "#fillAll";
      el.disabled = value || (needsProfile && !(scan && scan.hasProfile));
    }
    for (const input of document.querySelectorAll(".field-switch input")) {
      input.disabled = value;
    }
  };

  const activeTab = async () => {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0];
  };

  const urlAllowed = (url) =>
    typeof url === "string" && (/^https?:/i.test(url) || /^file:/i.test(url));

  const RESTRICTED_HOSTS =
    /(^|\.)(addons\.mozilla\.org|chrome\.google\.com|chromewebstore\.google\.com|microsoftedge\.microsoft\.com)$/i;

  // Pages where Firefox intentionally refuses to run content scripts. Giving
  // these a dedicated message is clearer than a generic "could not read".
  const isRestrictedPage = (url) => {
    if (!urlAllowed(url)) return true;
    try {
      return RESTRICTED_HOSTS.test(new URL(url).hostname);
    } catch (_) {
      return true;
    }
  };

  const restrictedMessage = () =>
    "Firefox does not let extensions read browser pages, the add-on store or the built-in PDF viewer. Open the job application in a regular tab.";

  let injectedOnce = false;

  const inject = async () => {
    if (injectedOnce || !tab || !tab.id) return;
    if (!urlAllowed(tab.url)) throw new Error("This page does not allow extensions");
    try {
      // allFrames is safe now that every content module is idempotent. If a
      // restricted third-party frame makes the whole call fail, inject into
      // the top document instead.
      await api.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: CONTENT_FILES
      });
    } catch (_) {
      await api.scripting.executeScript({
        target: { tabId: tab.id },
        files: CONTENT_FILES
      });
    }
    injectedOnce = true;
    await sleep(320);
  };

  const send = async (message, { allFrames = false } = {}) => {
    if (!tab || !tab.id) throw new Error("No active tab");
    // Scan/pick/fill-one operate on the top frame only. Without a frameId,
    // Firefox would deliver the same message to every iframe, and field ids
    // are only unique within a document. Fill-all is intentionally broadcast.
    const options = allFrames ? undefined : { frameId: 0 };
    try {
      return await api.tabs.sendMessage(tab.id, message, options);
    } catch (error) {
      await inject();
      return api.tabs.sendMessage(tab.id, message, options);
    }
  };

  const executeTop = async (func, args = []) => {
    if (!tab || !tab.id) throw new Error("No active tab");
    const results = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func,
      args
    });
    const result = Array.isArray(results) && results[0] ? results[0].result : null;
    if (!result) throw new Error("The page did not return a result");
    if (result.error) throw new Error(result.error);
    return result;
  };

  const executeAllFrames = async (func, args = []) => {
    if (!tab || !tab.id) throw new Error("No active tab");
    try {
      const results = await api.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func,
        args
      });
      const values = (results || []).map((item) => item.result).filter(Boolean);
      if (values.length) return values;
    } catch (_) {
      /* fall through to the top frame */
    }
    const value = await executeTop(func, args);
    return value ? [value] : [];
  };

  const scanViaScripting = async () => {
    const scanOnce = () =>
      executeTop(async () => {
      if (!window.JAFiller || !window.JAProfile) {
        return { error: "The content script is not available in this frame." };
      }
      // Always refresh from storage when the popup opens. A content script
      // injected before the profile was imported would otherwise keep using
      // an empty cached copy.
      try {
        window.JAFiller.setProfile(await window.JAProfile.load());
      } catch (_) {
        /* ignore */
      }
      const currentProfile = window.JAFiller.getProfile();
      const result = window.JAFiller.describeAll();
      return {
        ok: true,
        fields: result.fields,
        stats: result.stats,
        page: {
          title: document.title || "",
          url: location.href,
          host: location.hostname || location.host || "",
          topFrame: window.top === window
        },
        hasProfile:
          Boolean(currentProfile) && !window.JAProfile.isProfileEmpty(currentProfile),
        completeness: window.JAProfile.completeness(
          currentProfile || window.JAProfile.DEFAULT_PROFILE
        ),
        settings: (currentProfile && currentProfile.settings) || {},
        blocked: window.JAProfile.isBlocked(currentProfile, location.hostname),
        hasFileInput: Boolean(document.querySelector('input[type="file"]'))
      };
      });

    try {
      const value = await scanOnce();
      injectedOnce = true;
      return value;
    } catch (firstError) {
      // The tab may have been open before the extension was installed.
      await inject();
      try {
        const value = await scanOnce();
        injectedOnce = true;
        return value;
      } catch (secondError) {
        throw new Error(`${firstError.message}; ${secondError.message}`);
      }
    }
  };

  const fillOneViaScripting = (fieldId, value) =>
    executeTop(
      async (id, val) => {
        if (!window.JAFiller) return { error: "The content script is not available in this frame." };
        const result = await window.JAFiller.fillById(id, val);
        return { ok: Boolean(result && result.ok), result };
      },
      [fieldId, value]
    );

  const fillAllViaScripting = async (overwrite) => {
    await inject();
    const summaries = await executeAllFrames(
      async (shouldOverwrite) => {
        if (!window.JAFiller) return null;
        return window.JAFiller.fillPage({ overwrite: Boolean(shouldOverwrite) });
      },
      [Boolean(overwrite)]
    );
    if (!summaries.length) throw new Error("No frame accepted the fill request");
    return summaries.reduce(
      (total, summary) => ({
        filled: total.filled + (summary.filled || 0),
        skipped: total.skipped + (summary.skipped || 0),
        failed: total.failed + (summary.failed || 0),
        total: total.total + (summary.total || 0),
        messages: [...total.messages, ...(summary.messages || [])]
      }),
      { filled: 0, skipped: 0, failed: 0, total: 0, messages: [] }
    );
  };

  const undoViaScripting = async () => {
    await inject();
    const results = await executeAllFrames(async () => {
      if (!window.JAFiller) return null;
      return window.JAFiller.undo();
    });
    return results.reduce((count, result) => count + (result && result.restored ? result.restored : 0), 0);
  };

  const pickViaScripting = async () => {
    await inject();
    await executeTop(async () => {
      if (!window.JAPicker) return { error: "The page picker is not available in this frame." };
      window.JAPicker.show();
      return { ok: true };
    });
  };

  const refreshScan = async () => {
    try {
      const response = await scanViaScripting();
      if (response && response.ok) {
        applyScan(response);
        return response;
      }
    } catch (_) {
      /* fall back to messaging */
    }
    try {
      const response = await send({ type: "SCAN" });
      if (response && response.ok) {
        applyScan(response);
        return response;
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  };

  const hostOf = () => {
    if (scan && scan.page && scan.page.host) return scan.page.host;
    try {
      return new URL(tab.url).hostname;
    } catch (_) {
      return "";
    }
  };

  const profileLabel = () => {
    if (!profile) return "";
    const p = profile.personal || {};
    const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
    return name || p.email || "";
  };

  const refreshCatalog = () => {
    if (!profile) {
      catalog = [];
      return;
    }
    try {
      catalog = window.JAProfile.catalog(profile);
    } catch (_) {
      catalog = [];
    }
  };

  const applyScan = (response) => {
    if (!response) return;
    scan = response;
    const localHasProfile = Boolean(profile) && !window.JAProfile.isProfileEmpty(profile);
    $("#profileBanner").hidden = localHasProfile;

    const stats = response.stats || { total: 0, matched: 0, filled: 0, ready: 0 };
    $("#statMatched").textContent = stats.matched;
    $("#statFilled").textContent = stats.filled;
    $("#statTotal").textContent = stats.total;

    hideError();
    $("#summary").hidden = false;
    const hasFields = Array.isArray(response.fields) && response.fields.length > 0;
    $("#fieldsSection").hidden = !hasFields;
    $("#emptyState").hidden = hasFields;

    const host = hostOf();
    $("#siteLabel").textContent = host || "This page";
    $("#siteLabel").title = (response.page && response.page.title) || "";
    $("#profileName").textContent = profileLabel();

    const enabled = Boolean(response.settings && response.settings.autoFill) && !response.blocked;
    $("#siteAutoFill").checked = enabled;
    $("#siteAutoFill").disabled = !localHasProfile;
    $("#fileNotice").hidden = !response.hasFileInput;

    const canFill = Boolean(response.hasProfile) || localHasProfile;
    $("#fillEmpty").disabled = busy || !canFill;
    $("#fillAll").disabled = busy || !canFill;

    renderFields();
  };

  const loadPage = async ({ silent = false } = {}) => {
    setLoading(true);
    hideError();
    if (!silent) setStatus("");
    try {
      let response = null;
      let scriptingError = null;
      try {
        response = await scanViaScripting();
      } catch (error) {
        scriptingError = error;
        try {
          response = await send({ type: "SCAN" });
        } catch (messageError) {
          throw new Error(
            `${scriptingError.message}; ${messageError.message}`
          );
        }
      }
      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) ||
            (scriptingError && scriptingError.message) ||
            "The page did not respond"
        );
      }
      applyScan(response);
      if (!silent) setStatus("");
      return true;
    } catch (error) {
      const url = String((tab && tab.url) || "");
      if (isRestrictedPage(url)) {
        showError({
          title: "This page is off-limits",
          message: restrictedMessage(),
          detail: url
        });
      } else if (url.startsWith("file:")) {
        showError({
          title: "Can't read this file",
          message:
            "Enable “Access file URLs” for this add-on in about:addons → Permissions, then reload the tab.",
          detail: error && error.message
        });
      } else {
        showError({
          title: "Can't read this page",
          message:
            "The tab may have been open before the extension was installed. Reload it, then try again.",
          detail: error && error.message
        });
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  const kindLabel = (kind) => {
    switch (kind) {
      case "tags":
        return "skills";
      case "richtext":
        return "rich text";
      case "combobox":
      case "select":
        return "dropdown";
      case "choice":
        return "checkbox / radio";
      case "date":
        return "date";
      case "file":
        return "file";
      default:
        return "text";
    }
  };

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const suggestionsFor = (field) => {
    const out = [];
    const seen = new Set();
    const add = (label, value, group) => {
      if (!hasValue(value)) return;
      const key = String(value);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        label: String(label || value),
        value,
        group: group || "Suggested"
      });
    };
    for (const item of field.suggestions || []) add(item.label, item.value, item.group);

    const normalize = window.JAProfile.normalizeText;
    const labelTokens = new Set(normalize(field.label || "").split(" ").filter((token) => token.length > 2));
    const ruleKey = String(field.ruleId || "").split(".").pop().toLowerCase();
    const relevance = (entry) => {
      let score = 0;
      const label = normalize(entry.label || "");
      if (label && label === normalize(field.label || "")) score += 100;
      for (const token of labelTokens) if (label.includes(token)) score += 12;
      if (ruleKey && entry.path && String(entry.path).toLowerCase().includes(ruleKey)) score += 8;
      if (entry.group === "Saved answers") score -= 5;
      return score;
    };
    const ordered = [...catalog].sort((a, b) => relevance(b) - relevance(a));
    for (const item of ordered) add(item.label, item.value, item.group);
    if (field.kind === "choice" && !out.length) {
      add("Yes", "Yes", "Choice");
      add("No", "No", "Choice");
    }
    return out;
  };

  const saveAnswer = async (field, value) => {
    try {
      const latest = await window.JAProfile.load();
      const key = window.JAProfile.customKey(field.contextLabel || field.label || "");
      if (!key) return;
      latest.customAnswers[key] = String(value);
      profile = await window.JAProfile.save(latest);
      refreshCatalog();
      setStatus(`Saved as “${key}”.`);
    } catch (error) {
      setStatus("Filled, but the answer could not be saved.", true);
    }
  };

  const fillOne = async (field, value, { remember = false } = {}) => {
    if (busy) return;
    setBusy(true);
    setStatus(`Filling “${field.label}”…`);
    try {
      let response;
      try {
        const result = await fillOneViaScripting(field.id, value);
        response = { ok: Boolean(result && result.ok), result };
      } catch (_) {
        response = await send({ type: "FILL_ONE", fieldId: field.id, value });
      }
      if (response && response.ok) {
        if (remember) await saveAnswer(field, value);
        await refreshScan();
        setStatus("Filled ✓");
      } else {
        const reason =
          (response && response.result && (response.result.message || response.result.reason)) ||
          (response && response.error) ||
          "This field could not be filled.";
        setStatus(reason, true);
      }
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), true);
    } finally {
      setBusy(false);
    }
  };

  const buildPicker = (field) => {
    const wrap = element("div", "picker");
    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search saved values…";
    search.autocomplete = "off";
    search.spellcheck = false;
    wrap.appendChild(search);

    const list = element("div", "pick-list");
    wrap.appendChild(list);

    const items = suggestionsFor(field);

    const renderOptions = (query = "") => {
      list.innerHTML = "";
      const needle = query.trim().toLowerCase();
      const filtered = items
        .filter((item) => {
          if (!needle) return true;
          return `${item.label} ${item.value} ${item.group}`.toLowerCase().includes(needle);
        })
        .slice(0, 60);
      if (!filtered.length) {
        list.appendChild(element("div", "picker-empty", "No saved value matches. Type it below."));
        return;
      }
      for (const item of filtered) {
        const button = element("button", "option");
        button.type = "button";
        button.title = String(item.value);
        button.appendChild(element("span", "option-label", item.label));
        button.appendChild(element("span", "option-value", String(item.value).replace(/\s+/g, " ")));
        button.addEventListener("click", () => {
          fillOne(field, item.value, { remember: wrap.querySelector(".remember-check").checked });
        });
        list.appendChild(button);
      }
    };
    renderOptions();
    search.addEventListener("input", () => renderOptions(search.value));

    const custom = element("div", "custom-row");
    const textarea = document.createElement("textarea");
    textarea.rows = 2;
    textarea.placeholder = "Or type a value…";
    textarea.spellcheck = false;
    const fillButton = element("button", "", "Fill");
    fillButton.type = "button";
    fillButton.addEventListener("click", () => {
      const value = textarea.value.trim();
      if (value) fillOne(field, value, { remember: wrap.querySelector(".remember-check").checked });
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const value = textarea.value.trim();
        if (value) fillOne(field, value, { remember: wrap.querySelector(".remember-check").checked });
      }
    });
    custom.append(textarea, fillButton);
    wrap.appendChild(custom);

    const remember = element("label", "remember");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "remember-check";
    remember.append(check, document.createTextNode("Save as answer for this field"));
    wrap.appendChild(remember);

    return wrap;
  };

  const setFakeCpf = async (enabled) => {
    if (busy) return;
    setBusy(true);
    try {
      const latest = await window.JAProfile.load();
      latest.settings.useFakeCpf = Boolean(enabled);
      profile = await window.JAProfile.save(latest);
      refreshCatalog();
      await refreshScan();
      send({ type: "RELOAD_PROFILE" }, { allFrames: true }).catch(() => {});
      setStatus(
        enabled
          ? "CPF will be filled with a generated fake value."
          : "CPF will use the value saved in your profile."
      );
    } catch (error) {
      setStatus("Could not change the CPF setting.", true);
    } finally {
      setBusy(false);
      if (scan) renderFields();
    }
  };

  const buildField = (field) => {
    const row = element("div", `field ${field.status}`);
    const top = element("div", "field-top");
    const dot = element("span", `dot ${field.status}`);
    const main = element("div", "field-main");

    const labelLine = element("div", "field-label");
    labelLine.appendChild(document.createTextNode(field.label || "Unlabelled field"));
    if (field.required) labelLine.appendChild(element("span", "req", "*"));
    main.appendChild(labelLine);

    const meta = element("div", "field-meta");
    if (field.source === "rule") meta.appendChild(element("span", "badge matched", "matched"));
    else if (field.source === "custom") meta.appendChild(element("span", "badge saved", "saved answer"));
    else meta.appendChild(element("span", "badge", "no match"));
    meta.appendChild(element("span", "badge", kindLabel(field.kind)));
    if (field.status === "filled") meta.appendChild(element("span", "badge", "on page"));
    main.appendChild(meta);

    if (field.status === "filled" && field.current) {
      main.appendChild(element("div", "field-value", `Current: ${field.current}`));
    } else if (hasValue(field.value) && field.preview) {
      main.appendChild(element("div", "field-value", `Will fill: ${field.preview}`));
    } else if (field.status === "unknown") {
      main.appendChild(element("div", "field-value", "Not matched to the profile yet."));
    }

    top.append(dot, main);

    const actions = element("div", "field-actions");
    if (hasValue(field.value)) {
      const fill = element("button", "fill", field.status === "filled" ? "Refill" : "Fill");
      fill.type = "button";
      fill.addEventListener("click", () => fillOne(field, field.value));
      actions.appendChild(fill);
    }
    const choose = element("button", "choose", expanded.has(field.id) ? "Hide values" : "Choose value");
    choose.type = "button";
    choose.addEventListener("click", () => {
      if (expanded.has(field.id)) expanded.delete(field.id);
      else expanded.add(field.id);
      renderFields();
    });
    actions.appendChild(choose);

    if (field.ruleId === "personal.cpf") {
      const fakeToggle = element("label", "field-switch");
      fakeToggle.title = "Generate a valid-format CPF instead of the saved number";
      const fakeInput = document.createElement("input");
      fakeInput.type = "checkbox";
      fakeInput.className = "switch";
      fakeInput.checked = Boolean(profile && profile.settings && profile.settings.useFakeCpf);
      fakeInput.addEventListener("change", () => setFakeCpf(fakeInput.checked));
      fakeToggle.append(fakeInput, document.createTextNode("Fake CPF"));
      actions.appendChild(fakeToggle);
    }

    row.append(top, actions);
    if (expanded.has(field.id)) row.appendChild(buildPicker(field));
    return row;
  };

  const statusRank = (field) => {
    if (field.status === "ready") return 0;
    if (field.status === "unknown") return 1;
    if (field.status === "empty") return 2;
    return 3;
  };

  const renderFields = () => {
    const list = $("#fieldList");
    list.innerHTML = "";
    if (!scan || !Array.isArray(scan.fields)) return;
    const fields = [...scan.fields].sort((a, b) => {
      const rank = statusRank(a) - statusRank(b);
      if (rank !== 0) return rank;
      if (a.required !== b.required) return a.required ? -1 : 1;
      return 0;
    });
    const fragment = document.createDocumentFragment();
    for (const field of fields) fragment.appendChild(buildField(field));
    list.appendChild(fragment);
  };

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  const fillAll = async (overwrite) => {
    if (busy) return;
    setBusy(true);
    setStatus(overwrite ? "Overwriting fields…" : "Filling empty fields…");
    try {
      let summary;
      try {
        summary = await fillAllViaScripting(overwrite);
      } catch (_) {
        const response = await send(
          { type: "FILL_ALL", overwrite: Boolean(overwrite) },
          { allFrames: true }
        );
        if (!response || !response.ok) {
          throw new Error((response && response.error) || "Could not fill this page.");
        }
        summary = response.summary || { filled: 0, failed: 0, total: 0 };
      }
      await refreshScan();
      const failed = summary.failed ? ` · ${summary.failed} need attention` : "";
      setStatus(`Filled ${summary.filled} of ${summary.total} field(s)${failed}.`);
      $("#undoBtn").hidden = summary.filled === 0;
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), true);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let restored = 0;
      try {
        restored = await undoViaScripting();
      } catch (_) {
        const response = await send({ type: "UNDO" }, { allFrames: true });
        if (!response || !response.ok) {
          setStatus(
            (response && response.result && response.result.message) || "Nothing to undo.",
            true
          );
          setBusy(false);
          return;
        }
        restored = response.result.restored || 0;
      }
      await refreshScan();
      setStatus(
        restored ? `Restored ${restored} field(s).` : "Nothing to undo.",
        !restored
      );
      $("#undoBtn").hidden = true;
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), true);
    } finally {
      setBusy(false);
    }
  };

  const pickOnPage = async () => {
    if (busy) return;
    setBusy(true);
    setStatus("Opening the page picker…");
    try {
      try {
        await pickViaScripting();
      } catch (_) {
        await send({ type: "START_PICK" });
      }
      window.close();
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), true);
      setBusy(false);
    }
  };

  const toggleSite = async () => {
    const wantEnabled = $("#siteAutoFill").checked;
    try {
      const latest = await window.JAProfile.load();
      const host = hostOf();
      const lines = String((latest.settings && latest.settings.blocklist) || "")
        .split(/[\n,]+/)
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean)
        .filter((line) => {
          if (!host) return true;
          return line !== host.toLowerCase() && !host.toLowerCase().endsWith(`.${line}`);
        });
      if (!wantEnabled && host) lines.push(host.toLowerCase());
      latest.settings.blocklist = [...new Set(lines)].join("\n");
      if (wantEnabled) latest.settings.autoFill = true;
      profile = await window.JAProfile.save(latest);
      refreshCatalog();
      if (scan) scan.blocked = !wantEnabled;
      setStatus(
        wantEnabled
          ? "Auto-fill enabled on this site."
          : "Auto-fill disabled on this site. Manual fill still works."
      );
      send({ type: "RELOAD_PROFILE" }, { allFrames: true }).catch(() => {});
    } catch (error) {
      setStatus("Could not save the site setting.", true);
      $("#siteAutoFill").checked = !wantEnabled;
    }
  };

  const openOptions = () => {
    api.runtime.openOptionsPage();
    window.close();
  };

  const bind = () => {
    $("#settingsBtn").addEventListener("click", openOptions);
    $("#setupBtn").addEventListener("click", openOptions);
    $("#fillEmpty").addEventListener("click", () => fillAll(false));
    $("#fillAll").addEventListener("click", () => fillAll(true));
    $("#pickMode").addEventListener("click", pickOnPage);
    $("#undoBtn").addEventListener("click", undo);
    $("#siteAutoFill").addEventListener("change", toggleSite);
    $("#refreshBtn").addEventListener("click", () => loadPage());
    $("#refreshBtn2").addEventListener("click", () => loadPage());
    $("#retryBtn").addEventListener("click", () => {
      // A failed attempt may have left the tab without our content script.
      injectedOnce = false;
      loadPage();
    });
    $("#reloadTabBtn").addEventListener("click", async () => {
      if (!tab || !tab.id) return;
      await api.tabs.reload(tab.id);
      window.close();
    });
  };

  const boot = async () => {
    bind();
    try {
      profile = await window.JAProfile.load();
      refreshCatalog();
      $("#profileName").textContent = profileLabel();
      $("#profileBanner").hidden = !window.JAProfile.isProfileEmpty(profile) || !profile;
      tab = await activeTab();
      if (!tab || !tab.id) {
        showError({
          title: "No active tab",
          message: "Open a job application in a regular tab, then try again."
        });
        hideLoading();
        return;
      }
      $("#siteLabel").textContent = hostOf() || "This tab";
      if (isRestrictedPage(tab.url)) {
        showError({
          title: "This page is off-limits",
          message: restrictedMessage(),
          detail: tab.url
        });
        hideLoading();
        return;
      }
      await loadPage();
    } catch (error) {
      showError({
        title: "Something went wrong",
        message:
          "Reload the tab and try again. If it keeps happening, reload the extension.",
        detail: String(error && error.message ? error.message : error)
      });
      hideLoading();
    }
  };

  boot();
})();
