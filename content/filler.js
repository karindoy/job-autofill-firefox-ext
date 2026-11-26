/**
 * The filling engine.
 *
 * Responsibilities:
 *  - discover visible form controls and match them against the profile
 *  - write values in a way React/Vue/Angular forms actually notice
 *  - handle text inputs, selects, custom comboboxes, radio/checkbox groups,
 *    date fields, chip/tag inputs and rich-text editors
 *  - auto-fill empty fields when the page (or an SPA step) changes
 *  - keep an undo snapshot for the last fill
 */
"use strict";
(() => {
  if (window.JAFiller) return;
  const {
    normalizeText,
    splitList,
    toISO,
    toISOMonth,
    explicitDatePreference
  } = window.JAProfile;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const isEditable = (el) =>
    Boolean(
      el &&
        (el.isContentEditable ||
          el.getAttribute?.("contenteditable") === "true" ||
          el.getAttribute?.("contenteditable") === "")
    );

  const asText = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean).join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value ?? "").trim();
  };

  const hasValue = (value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return true;
    return String(value ?? "").trim().length > 0;
  };

  const normalizeChoice = (value) => {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return asText(value);
  };

  const COUNTRY_ALIASES = {
    brazil: ["brazil", "brasil", "br", "bra"],
    "united states": ["united states", "united states of america", "usa", "us", "eua", "estados unidos"],
    "united kingdom": ["united kingdom", "uk", "great britain", "england", "reino unido"],
    portugal: ["portugal", "pt", "prt"],
    canada: ["canada", "ca", "can"],
    germany: ["germany", "deutschland", "de", "deu"],
    spain: ["spain", "espana", "es", "esp"],
    france: ["france", "fr", "fra"],
    ireland: ["ireland", "ie", "irl"],
    netherlands: ["netherlands", "holland", "nl", "nld"],
    australia: ["australia", "au", "aus"],
    argentina: ["argentina", "ar", "arg"],
    mexico: ["mexico", "mx", "mex"],
    india: ["india", "in", "ind"],
    poland: ["poland", "pl", "pol"],
    switzerland: ["switzerland", "ch", "che"],
    italy: ["italy", "italia", "it", "ita"],
    sweden: ["sweden", "se", "swe"],
    norway: ["norway", "no", "nor"],
    denmark: ["denmark", "dk", "dnk"]
  };

  const CHOICE_SYNONYMS = {
    yes: ["yes", "y", "true", "sim", "authorized", "eligible", "i am", "i do"],
    no: ["no", "n", "false", "nao", "not authorized", "i am not", "i do not"],
    remote: ["remote", "remoto", "work from home", "wfh", "fully remote", "anywhere"],
    hybrid: ["hybrid", "hibrido", "partially remote"],
    "on site": ["on site", "onsite", "on-site", "presencial", "in office", "office"],
    flexible: ["flexible", "flexivel", "any"],
    "decline to self identify": [
      "decline",
      "decline to self identify",
      "prefer not",
      "do not wish",
      "don t wish",
      "wish to answer",
      "not to answer",
      "not to say",
      "rather not",
      "nao desejo",
      "nao quero",
      "prefiro nao",
      "informar",
      "declarar",
      "responder",
      "prefiro nao informar",
      "nao informar",
      "nao desejo informar",
      "nao quero informar",
      "sem informacao",
      "nao declarar"
    ],
    woman: ["woman", "female", "mulher", "feminino"],
    man: ["man", "male", "homem", "masculino"],
    "non binary": ["non binary", "nonbinary", "nao binario", "nao binaria"],
    white: ["white", "branco", "branca"],
    "black or african american": ["black", "african american", "preto", "preta", "negro", "negra"],
    asian: ["asian", "asiatico", "asiatica", "amarelo", "amarela"],
    "hispanic or latino": ["hispanic", "latino", "latina", "hispano", "hispana"],
    "american indian or alaska native": ["native american", "indigena", "indio", "indio americano"],
    "native hawaiian or other pacific islander": ["pacific islander", "havaiano", "polinesio"],
    "i am not a protected veteran": [
      "i am not a protected veteran",
      "not a protected veteran",
      "not protected",
      "nao sou veterano",
      "nao sou um veterano protegido",
      "nao sou veterano protegido"
    ],
    "not a protected veteran": [
      "not a protected veteran",
      "not protected",
      "nao sou veterano",
      "nao sou um veterano protegido",
      "nao sou veterano protegido"
    ],
    "i am a protected veteran": ["i am a protected veteran", "protected veteran", "sou veterano", "veterano protegido"],
    "protected veteran": ["protected veteran", "sou veterano", "veterano protegido"],
    "professional working proficiency": [
      "professional",
      "professional working",
      "full professional",
      "advanced",
      "avancado",
      "avancada",
      "fluente",
      "fluent",
      "profissional",
      "fluencia profissional",
      "c1",
      "c2"
    ],
    "native or bilingual proficiency": [
      "native",
      "nativo",
      "nativa",
      "bilingual",
      "bilingue",
      "mother tongue",
      "fluent",
      "fluente",
      "c2"
    ],
    "full professional proficiency": ["full professional", "professional", "fluent", "fluente", "advanced", "avancado", "c1"],
    "associate s degree": [
      "associate s degree",
      "associate degree",
      "associate",
      "tecnologo",
      "ensino superior completo",
      "superior completo",
      "graduacao completa",
      "graduacao"
    ],
    "bachelor s degree": [
      "bachelor s degree",
      "bachelor degree",
      "bachelor",
      "ensino superior completo",
      "superior completo",
      "graduacao completa",
      "graduacao"
    ],
    "master s degree": ["master s degree", "master degree", "master", "mestrado", "pos graduacao"],
    doctorate: ["doctorate", "phd", "doutorado"],
    "high school": ["high school", "ensino medio", "medio completo", "segundo grau"],
    intermediate: ["intermediate", "intermediario", "b1", "b2"],
    basic: ["basic", "basico", "beginner", "iniciante", "a1", "a2"],
    immediately: ["immediately", "imediato", "imediata", "asap", "now"],
    "2 weeks": ["2 weeks", "two weeks", "15 days", "15 dias"],
    "30 days": ["30 days", "one month", "1 month", "30 dias"],
    "60 days": ["60 days", "two months", "2 months", "60 dias"],
    clt: ["clt", "efetivo", "empregado", "employee", "full time", "tempo integral"],
    pj: ["pj", "pessoa juridica", "contractor", "contract", "freelancer", "autonomo", "autonoma"],
    estagio: ["estagio", "estagiario", "estagiaria", "intern", "internship"],
    aprendiz: ["aprendiz", "apprentice"],
    temporario: ["temporario", "temporaria", "temporary", "temp"]
  };

  const choiceVariants = (value) => {
    const base = normalizeChoice(value);
    const normalized = normalizeText(base);
    const variants = [base];
    const synonyms = CHOICE_SYNONYMS[normalized];
    if (synonyms) variants.push(...synonyms);
    for (const [key, aliases] of Object.entries(COUNTRY_ALIASES)) {
      if (normalized === key || aliases.includes(normalized) || (normalized.length > 2 && key.includes(normalized))) {
        variants.push(key, ...aliases);
        break;
      }
    }
    if (/^(decline|prefer not|do not wish)/.test(normalized)) {
      variants.push(...CHOICE_SYNONYMS["decline to self identify"]);
    }
    return [...new Set(variants.map((item) => String(item).trim()).filter(Boolean))];
  };

  const isPlaceholderOption = (option) => {
    const text = normalizeText(option.text);
    const value = normalizeText(option.value);
    if (!text && !value) return true;
    return /^(select|select one|choose|choose one|please select|pick one|none selected|--|selecione|escolha|selecione uma opcao)$/.test(
      text || value
    );
  };

  const scoreTextMatch = (candidateText, candidateValue, variants) => {
    // Hyphens are common in pt-BR option labels ("Pós-graduação",
    // "Não-binário") and in English ones ("on-site"). Treat them as spaces so
    // the same synonym matches both spellings.
    const flatten = (value) => normalizeText(value).replace(/-/g, " ");
    const text = flatten(candidateText);
    const value = flatten(candidateValue);
    const textTokens = text.split(" ").filter(Boolean);
    const valueTokens = value.split(" ").filter(Boolean);
    let best = 0;
    variants.forEach((variant, index) => {
      const desired = flatten(variant);
      if (!desired) return;
      const penalty = index * 2;
      if (text === desired) best = Math.max(best, 1000 - penalty);
      else if (value === desired) best = Math.max(best, 980 - penalty);
      else if (textTokens.includes(desired)) best = Math.max(best, 930 - penalty);
      else if (valueTokens.includes(desired)) best = Math.max(best, 910 - penalty);
      else if (text && (text.startsWith(desired) || desired.startsWith(text))) {
        best = Math.max(best, 840 - penalty);
      } else if (value && (value.startsWith(desired) || desired.startsWith(value))) {
        best = Math.max(best, 820 - penalty);
      } else if (desired.length >= 3 && text && text.includes(desired)) {
        best = Math.max(best, 760 - penalty);
      } else if (desired.length >= 3 && value && value.includes(desired)) {
        best = Math.max(best, 740 - penalty);
      } else if (desired.length >= 3 && text) {
        const tokens = new Set(textTokens.filter((token) => token.length > 2));
        const wanted = desired.split(" ").filter((token) => token.length > 2);
        if (wanted.length && tokens.size) {
          let shared = 0;
          for (const token of wanted) if (tokens.has(token)) shared += 1;
          const ratio = shared / wanted.length;
          if (ratio >= 0.6) best = Math.max(best, 600 + ratio * 100 - penalty);
        }
      }
    });
    return best;
  };

  const pickOption = (options, value) => {
    const variants = choiceVariants(value);
    if (!variants.length) return null;
    let best = null;
    let bestScore = 0;
    for (const option of options) {
      if (option.disabled) continue;
      const text = option.textContent || option.text || "";
      const optionValue = option.value || option.getAttribute?.("data-value") || "";
      const score = scoreTextMatch(text, optionValue, variants);
      const placeholderPenalty = isPlaceholderOption({ text, value: optionValue }) ? 600 : 0;
      const finalScore = score - placeholderPenalty;
      if (finalScore > bestScore) {
        best = option;
        bestScore = finalScore;
      }
    }
    return bestScore >= 500 ? best : null;
  };

  const dispatchMouse = (el) => {
    if (!el) return;
    const options = { bubbles: true, cancelable: true, view: window };
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", options));
    } catch (_) {
      /* PointerEvent not available */
    }
    el.dispatchEvent(new MouseEvent("mousedown", options));
    el.dispatchEvent(new MouseEvent("mouseup", options));
    el.dispatchEvent(new MouseEvent("click", options));
  };

  const dispatchKey = (el, key, keyCode) => {
    if (!el) return;
    const make = (type) => {
      const event = new KeyboardEvent(type, {
        key,
        code: key,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      try {
        Object.defineProperty(event, "keyCode", { get: () => keyCode });
        Object.defineProperty(event, "which", { get: () => keyCode });
      } catch (_) {
        /* ignore */
      }
      return event;
    };
    el.dispatchEvent(make("keydown"));
    el.dispatchEvent(make("keypress"));
    el.dispatchEvent(make("keyup"));
  };

  const setNativeValue = (el, value) => {
    if (!el) return;
    const prototype =
      el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement?.prototype
        : el.tagName === "SELECT"
          ? window.HTMLSelectElement?.prototype
          : window.HTMLInputElement?.prototype;
    let descriptor = null;
    try {
      descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
    } catch (_) {
      descriptor = null;
    }
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: value
      })
    );
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const visibleOptions = () => {
    const selectors = [
      '[role="option"]',
      '[role="listbox"] li',
      "[data-radix-collection-item]",
      "[data-value][role]",
      ".select__option",
      ".menu__option"
    ].join(",");
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll(selectors));
    } catch (_) {
      nodes = [];
    }
    return nodes
      .filter((node) => window.JALabels.isVisible(node) && node.getAttribute("aria-disabled") !== "true")
      .slice(0, 400);
  };

  const clickOption = async (option) => {
    if (!option) return false;
    try {
      option.scrollIntoView({ block: "nearest" });
    } catch (_) {
      /* ignore */
    }
    dispatchMouse(option);
    await sleep(80);
    return true;
  };

  const pressEnter = async (el) => {
    dispatchKey(el, "Enter", 13);
    await sleep(100);
  };

  const isComboboxElement = (el, ctx) => {
    if (!el) return false;
    if (ctx && ctx.isCombobox) return true;
    return Boolean(
      el.matches?.(
        '[role="combobox"], [aria-haspopup="listbox"], [aria-autocomplete="list"], input[list]'
      ) || el.closest?.('[role="combobox"]')
    );
  };

  const hasMeaningfulValue = (el) => {
    if (!el) return false;
    if (el.matches?.("input[type='checkbox'], input[type='radio']")) return false;
    if (el.tagName === "SELECT") {
      const option = el.options && el.options[el.selectedIndex];
      if (!option) return false;
      if (isPlaceholderOption(option)) return false;
      return Boolean(String(el.value || "").trim());
    }
    if (isEditable(el)) return Boolean(el.textContent.trim());
    return Boolean(String(el.value ?? el.textContent ?? "").trim());
  };

  const findChipContainer = (el) => {
    let node = el.parentElement;
    for (let depth = 0; node && depth < 5; depth += 1) {
      if (/^(FORM|BODY|HTML)$/i.test(node.tagName)) break;
      const chips = node.querySelectorAll(
        '[class*="chip"], [class*="tag"], [class*="token"], [class*="pill"], [data-testid*="chip"], [data-testid*="tag"]'
      );
      if (chips.length >= 1 && chips.length <= 200) return node;
      if (node.querySelector('button[aria-label*="remove" i], button[aria-label*="remover" i]')) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  };

  const chipTexts = (container, el) => {
    if (!container) return [];
    const nodes = container.querySelectorAll(
      '[class*="chip"], [class*="tag"], [class*="token"], [class*="pill"], [data-testid*="chip"], [data-testid*="tag"]'
    );
    return Array.from(nodes)
      .filter((node) => node !== el && !node.contains(el))
      .map((node) => normalizeText(node.textContent || ""))
      .filter(Boolean);
  };

  const findSuggestionButton = (container, value) => {
    if (!container) return null;
    const wanted = normalizeText(value);
    if (!wanted) return null;
    const buttons = Array.from(container.querySelectorAll("button, [role='option'], [role='button']"));
    return (
      buttons.find((button) => {
        if (button.disabled || button.getAttribute("aria-disabled") === "true") return false;
        const text = normalizeText(button.textContent || "");
        return text === wanted || text === `+ ${wanted}` || text === `add ${wanted}`;
      }) || null
    );
  };

  const isDateLikeInput = (el) => {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "date" || type === "month" || type === "datetime-local") return true;
    if (type && type !== "text") return false;
    const hint = normalizeText(
      [
        el.getAttribute("placeholder"),
        el.getAttribute("aria-label"),
        el.getAttribute("name"),
        el.id
      ]
        .filter(Boolean)
        .join(" ")
    );
    return /\b(mm|dd|yyyy|aaaa)\b/.test(hint) && !/phone|salary|amount|number|year of birth/.test(hint);
  };

  const detectDateFormat = (el, profile) => {
    const hint = normalizeText(
      [el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("name"), el.id]
        .filter(Boolean)
        .join(" ")
    );
    if (/dd[/ -]mm[/ -](yyyy|aaaa|yy|aa)|dia.*mes.*ano/.test(hint)) return "DD/MM/YYYY";
    if (/(yyyy|aaaa)[/ -]mm[/ -]dd/.test(hint)) return "YYYY-MM-DD";
    if (/mm[/ -]dd[/ -](yyyy|aaaa)|mes.*dia.*ano/.test(hint)) return "MM/DD/YYYY";
    if (/mmm.*yyyy|month.*year/.test(hint)) return "MMM YYYY";

    const current = String(el.value || "").trim();
    const numeric = current.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (numeric) {
      if (Number(numeric[1]) > 12) return "DD/MM/YYYY";
      if (Number(numeric[2]) > 12) return "MM/DD/YYYY";
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(current)) return "YYYY-MM-DD";
    return explicitDatePreference(profile);
  };

  const flash = (el, profile) => {
    if (!el || !profile || !profile.settings || !profile.settings.highlightFilled) return;
    if (!(el instanceof HTMLElement)) return;
    const previousOutline = el.style.outline;
    const previousOffset = el.style.outlineOffset;
    el.style.outline = "2px solid rgba(34, 197, 94, 0.9)";
    el.style.outlineOffset = "2px";
    setTimeout(() => {
      el.style.outline = previousOutline;
      el.style.outlineOffset = previousOffset;
    }, 1500);
  };

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  let profile = null;
  let recordsById = new Map();
  let idByElement = new WeakMap();
  let nextId = 1;
  let undoBatch = null;
  let selfFilling = 0;
  let autoObserver = null;
  let autoTimer = null;
  let autoRuns = 0;
  let lastAutoRun = 0;
  let started = false;
  let visibilityHooked = false;
  const touched = new WeakSet();
  let attempts = new WeakMap();
  const SELECTOR = window.JALabels.CONTROL_SELECTOR;

  const ensureTracking = () => {
    if (started) return;
    started = true;
    const markTouched = (event) => {
      if (selfFilling > 0) return;
      if (!event.isTrusted) return;
      if (event.target && event.target.matches?.(SELECTOR)) {
        touched.add(event.target);
        if (window.JA_DEBUG) {
          console.log("[Job Autofill] user touched", event.type, event.target.id || event.target.name);
        }
      }
    };
    document.addEventListener("input", markTouched, true);
    document.addEventListener("change", markTouched, true);
    document.addEventListener("focusin", markTouched, true);
  };

  const idFor = (el) => {
    let id = idByElement.get(el);
    if (!id) {
      id = nextId++;
      idByElement.set(el, id);
    }
    return id;
  };

  const attemptKey = (value) => {
    if (Array.isArray(value)) return value.join("|");
    return `${typeof value}:${String(value)}`;
  };

  const bumpAttempt = (el, value) => {
    let map = attempts.get(el);
    if (!map) {
      map = new Map();
      attempts.set(el, map);
    }
    const key = attemptKey(value);
    const count = (map.get(key) || 0) + 1;
    map.set(key, count);
    return count;
  };

  const attemptsFor = (el, value) => {
    const map = attempts.get(el);
    return map ? map.get(attemptKey(value)) || 0 : 0;
  };

  const isSearchBox = (el) => {
    const type = (el.getAttribute("type") || "").toLowerCase();
    const role = (el.getAttribute("role") || "").toLowerCase();
    const hay = normalizeText(
      [el.getAttribute("name"), el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label"), role]
        .filter(Boolean)
        .join(" ")
    );
    const formLike = /\b(skill|company|role|job|location|country|title|school|degree|name|email|phone)\b/.test(hay);
    if (type === "search" || role === "searchbox") return !formLike;
    if (!hay) return false;
    if (/^(search|search\.\.\.|pesquisar|filter|filtrar)$/.test(hay)) return true;
    return /\b(search|pesquisar|filter)\b/.test(hay) && !formLike;
  };

  const isExcludedInput = (el) => {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return ["file", "password", "hidden", "submit", "button", "reset", "image", "color", "range"].includes(type);
  };

  const discover = () => {
    let candidates = [];
    try {
      candidates = Array.from(document.querySelectorAll(SELECTOR));
    } catch (_) {
      return [];
    }
    const filtered = [];
    const seenRadioGroups = new Set();
    for (const el of candidates) {
      if (!el || !el.matches) continue;
      if (isExcludedInput(el)) continue;
      if (el.getAttribute("role") === "searchbox") continue;
      if (isSearchBox(el)) continue;
      if (el.getAttribute("aria-hidden") === "true") continue;
      if (!window.JALabels.isUsable(el)) continue;
      if (el.isContentEditable && el.closest('[role="combobox"]') && !el.matches('[role="combobox"]')) continue;
      if (el.tagName === "INPUT" && el.type === "radio" && el.name) {
        const key = `${el.name}::${el.form ? Array.from(document.forms).indexOf(el.form) : "none"}`;
        if (seenRadioGroups.has(key)) continue;
        seenRadioGroups.add(key);
      }
      filtered.push(el);
    }
    // Drop a combobox wrapper when its inner input is also a candidate.
    return filtered.filter((el) => {
      return !filtered.some((other) => other !== el && el.contains(other));
    });
  };

  const inferKind = (el, ctx, matched) => {
    if (ctx.isCheckbox || ctx.isRadio) return "choice";
    if (ctx.isSelect) return "select";
    if (matched && matched.mode === "tags") return "tags";
    if (matched && matched.mode === "richtext") return "richtext";
    if (ctx.isContentEditable || isEditable(el)) return "richtext";
    if (ctx.isCombobox) return "combobox";
    if (isDateLikeInput(el)) return "date";
    return "text";
  };

  const cleanLabelText = (text) =>
    String(text || "")
      .replace(/^[\s:*•·\-–—]+/, "")
      .replace(/[\s:*]+$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

  const buildRecord = (el, presetCtx) => {
    ensureTracking();
    const ctx = presetCtx || window.JALabels.buildContext(el);
    let matched = null;
    let custom = null;
    try {
      matched = window.JARules.match(ctx, profile || {});
    } catch (error) {
      console.warn("[Job Autofill] Matcher error", error);
    }
    if (!matched && profile) {
      custom = window.JAProfile.findCustomAnswer(profile, ctx.allLabelTexts);
    }
    const value = matched ? matched.value : custom ? custom.value : "";
    const kind = inferKind(el, ctx, matched);
    const labelFromContext = ctx.labels.length ? cleanLabelText(ctx.labels[0].text) : "";
    const fallbackLabel =
      cleanLabelText(el.getAttribute("aria-label")) ||
      cleanLabelText(el.getAttribute("placeholder")) ||
      cleanLabelText(el.name) ||
      cleanLabelText(el.id) ||
      "Unlabelled field";

    let status = "empty";
    if (kind === "file") status = "file";
    else if (hasMeaningfulValue(el)) status = "filled";
    else if (hasValue(value)) status = "ready";

    return {
      id: idFor(el),
      el,
      ctx,
      matched,
      custom,
      ruleId: matched ? matched.rule.id : custom ? "custom" : "",
      ruleLabel: matched ? matched.label : "",
      source: matched ? "rule" : custom ? "custom" : "none",
      label: (matched && matched.label) || labelFromContext || fallbackLabel,
      contextLabel: labelFromContext,
      kind,
      value,
      mode: matched ? matched.mode : kind === "tags" ? "tags" : kind === "richtext" ? "richtext" : "text",
      currentValue: ctx.currentValue,
      required: ctx.required,
      status
    };
  };

  const valuePreview = (value) => {
    const text = asText(value);
    return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  };

  const suggestionsFor = (record) => {
    if (!record.matched) {
      return record.custom
        ? [{ label: `Saved answer: ${record.custom.key}`, value: record.custom.value, group: "Saved answers" }]
        : [];
    }
    try {
      return window.JARules.suggestions(record.matched.rule, profile || {}, record.ctx);
    } catch (_) {
      return [];
    }
  };

  const describe = (record) => ({
    id: record.id,
    label: record.label,
    contextLabel: record.contextLabel,
    ruleId: record.ruleId,
    source: record.source,
    kind: record.kind,
    value: record.value,
    preview: valuePreview(record.value),
    current: valuePreview(record.currentValue),
    status: hasMeaningfulValue(record.el)
      ? "filled"
      : !record.ruleId && !record.value
        ? "unknown"
        : record.status,
    required: record.required,
    suggestions: suggestionsFor(record).map((item) => ({
      label: item.label,
      value: item.value,
      preview: valuePreview(item.value),
      group: item.group || ""
    }))
  });

  // Rules that describe one job entry. When a form repeats their fields
  // (work-history editors), each repetition gets the matching profile entry.
  const EXPERIENCE_SEQUENCE_RULES = new Set([
    "current.company",
    "current.title",
    "current.location",
    "current.startDate",
    "current.endDate",
    "current.current",
    "current.description",
    "current.skills",
    "current.employmentType"
  ]);

  // Closest section heading ("Empregos Anteriores", "Work experience", …).
  // Per-block headings such as "Experience 1" are skipped so the section
  // title is used to decide between "previous jobs" and "work history".
  const isBlockHeading = (text) => /^(experience|emprego|experi[eê]ncia|job|position|role|cargo)\s*[#nº°-]?\s*\d+\b/i.test(text);
  const sectionHeading = (el) => {
    let node = el.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      if (/^(BODY|HTML)$/i.test(node.tagName)) break;
      const headings = node.querySelectorAll ? node.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']") : [];
      for (const heading of headings) {
        if (heading.contains(el)) continue;
        const text = (heading.textContent || "").replace(/\s+/g, " ").trim();
        if (!text || text.length > 140 || isBlockHeading(text)) continue;
        return text;
      }
    }
    return "";
  };

  // Structure fingerprint of the field's container. Repeated work-history
  // blocks share it; a separate "Cargo pretendido" section does not, so its
  // field is not counted as another repetition.
  const structureKey = (el) => {
    const parts = [];
    let node = el.parentElement;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      const className = typeof node.className === "string" ? node.className.trim().replace(/\s+/g, ".") : "";
      parts.push(`${node.tagName}${className ? `.${className}` : ""}`);
    }
    return parts.join(">");
  };

  const buildContexts = (elements) => {
    const groups = new Map();
    const contexts = new Map();
    for (const el of elements) {
      let ctx;
      let matched;
      try {
        ctx = window.JALabels.buildContext(el);
        matched = window.JARules.match(ctx, profile || {});
      } catch (_) {
        continue;
      }
      contexts.set(el, ctx);
      if (!matched || !EXPERIENCE_SEQUENCE_RULES.has(matched.rule.id)) continue;
      const heading = sectionHeading(el);
      // Group by rule and container structure: repeated work-history blocks
      // share the same markup, while a field in another section does not.
      const key = `${matched.rule.id}::${structureKey(el)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ el, ctx, heading });
    }
    const pageHeading = normalizeText(
      `${(document.title || "")} ${(document.querySelector("h1") || {}).textContent || ""}`
    );
    const pageIsPrevious = /anterior|previous\s+(job|role|employment)|empregos?\s+anteriores/.test(pageHeading);
    for (const items of groups.values()) {
      if (items.length < 2) continue; // a single field still means "current role"
      const heading = normalizeText(items[0].heading);
      // "Previous jobs" starts at experience[0]; a generic work-history
      // editor starts with the current role and then the previous ones.
      const mode =
        /anterior|previous|past\s+(job|role|employment)|historico\s+profissional/.test(heading) || pageIsPrevious
          ? "previous"
          : "history";
      items.forEach((item, index) => {
        item.ctx.sequenceIndex = index;
        item.ctx.sequenceTotal = items.length;
        item.ctx.sequenceMode = mode;
      });
    }
    return contexts;
  };

  const scan = () => {
    const elements = discover();
    const contexts = buildContexts(elements);
    const records = elements.map((el) => buildRecord(el, contexts.get(el)));
    recordsById = new Map(records.map((record) => [record.id, record]));
    return records;
  };

  const describeAll = () => {
    const records = scan();
    const fields = records.map(describe);
    const matched = records.filter((record) => record.ruleId).length;
    const filled = records.filter((record) => hasMeaningfulValue(record.el)).length;
    const ready = records.filter((record) => hasValue(record.value) && !hasMeaningfulValue(record.el)).length;
    return {
      fields,
      stats: { total: records.length, matched, filled, ready }
    };
  };

  /* ------------------------------------------------------------------ */
  /* Filling primitives                                                  */
  /* ------------------------------------------------------------------ */

  const fillText = async (el, value, ctx) => {
    if (isEditable(el)) return fillRichText(el, value);
    if (!el.matches?.("input, textarea")) return fillRichText(el, value);
    if (el.readOnly || el.disabled) return { ok: false, reason: "readonly" };
    let text = asText(value);
    if (!text) return { ok: false, reason: "empty" };
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "number") {
      const numeric = text.replace(/,/g, ".").match(/-?\d+(\.\d+)?/);
      if (!numeric) return { ok: false, reason: "not-a-number", message: `“${text}” is not a number` };
      text = numeric[0];
    }
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
    if (isDateLikeInput(el)) return fillDate(el, text);
    setNativeValue(el, text);
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return { ok: true };
  };

  const fillDate = async (el, value) => {
    const type = (el.getAttribute("type") || "").toLowerCase();
    let text = "";
    if (type === "date") text = toISO(value);
    else if (type === "month") text = toISOMonth(value);
    else if (type === "datetime-local") text = `${toISO(value)}T00:00`;
    else text = window.JAProfile.formatDate(value, detectDateFormat(el, profile));
    if (!text) return { ok: false, reason: "invalid-date" };
    setNativeValue(el, text);
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return { ok: true };
  };

  const fillSelect = async (el, value) => {
    const desired = normalizeChoice(value);
    if (!desired) return { ok: false, reason: "empty" };
    const options = Array.from(el.options || []);
    const option = pickOption(options, desired);
    if (!option) {
      return { ok: false, reason: "no-option", message: `No option matches “${desired}”` };
    }
    el.focus({ preventScroll: true });
    setNativeValue(el, option.value);
    try {
      option.selected = true;
    } catch (_) {
      /* ignore */
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, selected: option.textContent };
  };

  const fillCheckbox = async (el, value, ctx) => {
    const desired = typeof value === "boolean" ? value : /^(yes|true|y|1|sim|checked)$/i.test(asText(value));
    const label = normalizeText(ctx.allLabelTexts.join(" "));
    let target = desired;
    const negative = /\b(no|not|never|nao|nunca|without)\b/.test(label) && !/\b(yes|sim|authorized|eligible)\b/.test(label);
    const positive = /\b(yes|sim)\b/.test(label) && !negative;
    if (positive) target = desired;
    else if (negative) target = !desired;
    if (el.checked === target) return { ok: true, skipped: true };
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
    el.click();
    if (el.checked !== target) {
      el.checked = target;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { ok: el.checked === target, checked: el.checked };
  };

  const radioGroup = (el) => {
    if (!el.name) return [el];
    try {
      return Array.from(
        (el.form || document).querySelectorAll(`input[type="radio"][name="${window.CSS?.escape ? CSS.escape(el.name) : el.name}"]`)
      );
    } catch (_) {
      return [el];
    }
  };

  const fillRadio = async (el, value, ctx) => {
    const desired = normalizeChoice(value);
    if (!desired) return { ok: false, reason: "empty" };
    const group = radioGroup(el);
    const candidates = group.map((radio) => {
      const radioCtx = window.JALabels.buildContext(radio);
      const label = [
        ...radioCtx.allLabelTexts,
        radio.value,
        radio.getAttribute("aria-label") || "",
        radio.value === "true" ? "yes" : radio.value === "false" ? "no" : ""
      ]
        .filter(Boolean)
        .join(" ");
      return { radio, label, score: scoreTextMatch(label, radio.value, choiceVariants(desired)) };
    });
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 500) {
      return { ok: false, reason: "no-option", message: `No radio option matches “${desired}”` };
    }
    if (!best.radio.checked) {
      best.radio.click();
      if (!best.radio.checked) {
        best.radio.checked = true;
        best.radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    return { ok: true, selected: best.label.slice(0, 60) };
  };

  const fillRichText = async (el, value) => {
    const text = asText(value);
    if (!text) return { ok: false, reason: "empty" };
    const beforeText = (el.textContent || "").trim();
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch (_) {
      inserted = false;
    }
    let currentText = el.textContent || "";
    if (!inserted || (currentText.trim() === "" && text.trim() !== "")) {
      // ProseMirror/Quill/slate often accept a synthetic paste but not
      // execCommand. Try a paste before replacing the DOM directly.
      try {
        const data = new DataTransfer();
        data.setData("text/plain", text);
        el.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: data
          })
        );
        currentText = el.textContent || "";
      } catch (_) {
        /* ignore */
      }
    }
    const afterText = (el.textContent || "").trim();
    if (!afterText || (afterText === beforeText && text.trim() !== beforeText)) {
      const fragment = document.createDocumentFragment();
      for (const part of text.split(/\n{2,}/)) {
        const paragraph = document.createElement("p");
        part.split("\n").forEach((line, index) => {
          if (index > 0) paragraph.appendChild(document.createElement("br"));
          paragraph.appendChild(document.createTextNode(line));
        });
        fragment.appendChild(paragraph);
      }
      el.textContent = "";
      el.appendChild(fragment);
    }
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: text })
    );
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  };

  const openCombobox = async (el, ctx, before) => {
    const host = ctx.host || el;
    try {
      host.focus({ preventScroll: true });
    } catch (_) {
      /* ignore */
    }
    await sleep(100);
    // Some comboboxes open on focus. Clicking again would close them.
    if (visibleOptions().some((option) => !before.has(option))) return;
    dispatchMouse(host);
    await sleep(160);
  };

  const fillCombobox = async (el, value) => {
    const text = asText(value);
    if (!text) return { ok: false, reason: "empty" };
    const ctx = window.JALabels.buildContext(el);
    const before = new Set(visibleOptions());
    await openCombobox(el, ctx, before);
    let options = visibleOptions().filter((option) => !before.has(option));
    if (!options.length) options = visibleOptions();
    let option = pickOption(options, text);
    if (!option && el.tagName === "INPUT") {
      setNativeValue(el, text);
      await sleep(220);
      const typed = visibleOptions().filter((candidate) => !before.has(candidate));
      option = pickOption(typed.length ? typed : visibleOptions(), text);
    }
    if (option) {
      await clickOption(option);
      await sleep(80);
      return { ok: true, selected: option.textContent };
    }
    if (el.tagName === "INPUT") {
      await pressEnter(el);
      if (String(el.value || "").trim()) {
        return { ok: true, typed: true };
      }
    }
    dispatchKey(el, "Escape", 27);
    return { ok: false, reason: "no-option", message: `Could not open the list to choose “${text}”` };
  };

  const fillTags = async (el, value) => {
    const values = (Array.isArray(value) ? value : splitList(asText(value)))
      .map((item) => String(item).trim())
      .filter(Boolean);
    if (!values.length) return { ok: false, reason: "empty" };

    const container = findChipContainer(el);
    const existing = chipTexts(container, el);
    const remaining = values
      .filter((item) => {
        const wanted = normalizeText(item);
        return !existing.some((chip) => {
          if (chip === wanted) return true;
          const chipTokens = chip.split(/[^a-z0-9+#.]+/).filter(Boolean);
          return chipTokens.includes(wanted);
        });
      })
      .slice(0, 10);

    const looksLikeMulti =
      Boolean(container) ||
      Boolean(el.closest?.('[role="combobox"], [aria-haspopup="listbox"]')) ||
      el.getAttribute("aria-autocomplete") === "list";

    if (!remaining.length) {
      return { ok: true, skipped: true, message: "Already contains these values" };
    }
    if (!looksLikeMulti) {
      const simple = el.tagName === "TEXTAREA" ? values.join(", ") : remaining[0];
      return fillText(el, simple, window.JALabels.buildContext(el));
    }

    let added = 0;
    for (const item of remaining) {
      const button = findSuggestionButton(container, item);
      if (button) {
        button.click();
        added += 1;
        await sleep(110);
        continue;
      }
      try {
        el.focus({ preventScroll: true });
      } catch (_) {
        /* ignore */
      }
      if (isEditable(el)) {
        el.textContent = item;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: item }));
      } else {
        setNativeValue(el, item);
      }
      await sleep(160);
      const option = pickOption(visibleOptions(), item);
      if (option) {
        await clickOption(option);
      } else {
        await pressEnter(el);
      }
      added += 1;
      await sleep(120);
      if (String(el.value || "").trim()) setNativeValue(el, "");
    }
    return { ok: true, added, message: `Added ${added} value${added === 1 ? "" : "s"}` };
  };

  const fillFile = async () => ({ ok: false, reason: "file", message: "File uploads must be attached manually" });

  async function fillElement(el, value, options = {}) {
    if (!el || !el.isConnected) return { ok: false, reason: "disconnected" };
    if (el.disabled || el.getAttribute?.("aria-disabled") === "true") {
      return { ok: false, reason: "disabled", message: "This field is disabled" };
    }
    const ctx = options.ctx || window.JALabels.buildContext(el);
    const mode = options.mode || "text";
    const raw = Array.isArray(value) ? value : asText(value);
    if (Array.isArray(raw) && !raw.length) return { ok: false, reason: "empty" };
    if (!Array.isArray(raw) && !raw) return { ok: false, reason: "empty" };

    if (el.matches?.('input[type="file"]')) return fillFile();
    if (el.matches?.('input[type="checkbox"]')) return fillCheckbox(el, raw, ctx);
    if (el.matches?.('input[type="radio"]')) return fillRadio(el, raw, ctx);
    if (el.tagName === "SELECT") return fillSelect(el, raw);
    if (mode === "tags") return fillTags(el, raw);
    if (ctx.isContentEditable || isEditable(el)) return fillRichText(el, raw);
    if (mode === "date" || isDateLikeInput(el)) return fillDate(el, asText(raw));
    if (mode === "cpf") {
      const digits = asText(raw).replace(/\D/g, "");
      const maxLength = Number(el.getAttribute?.("maxlength") || 0);
      const digitsOnly =
        (maxLength > 0 && maxLength <= 11) ||
        /^\d+$/.test(el.getAttribute?.("pattern") || "");
      return fillText(el, digitsOnly ? digits : window.JAProfile.formatCpf(digits), ctx);
    }
    if (mode === "rg") {
      const chars = window.JAProfile.rgChars(asText(raw));
      const maxLength = Number(el.getAttribute?.("maxlength") || 0);
      const plain =
        (maxLength > 0 && maxLength <= 9) ||
        /^[0-9x]+$/i.test(el.getAttribute?.("pattern") || "");
      return fillText(el, plain ? chars : window.JAProfile.formatRg(chars), ctx);
    }
    if (isComboboxElement(el, ctx)) return fillCombobox(el, raw);
    return fillText(el, raw, ctx);
  }

  /* ------------------------------------------------------------------ */
  /* Record filling                                                      */
  /* ------------------------------------------------------------------ */

  const snapshot = (el) => {
    try {
      if (el.matches?.('input[type="checkbox"], input[type="radio"]')) {
        return { el, kind: "check", value: el.checked };
      }
      if (el.tagName === "SELECT") return { el, kind: "value", value: el.value };
      if (isEditable(el) || !el.matches("input, textarea")) {
        return { el, kind: "html", value: el.cloneNode(true) };
      }
      return { el, kind: "value", value: el.value };
    } catch (_) {
      return null;
    }
  };

  const restoreSnapshot = (entry) => {
    if (!entry || !entry.el || !entry.el.isConnected) return;
    try {
      if (entry.kind === "check") {
        if (entry.el.checked !== entry.value) entry.el.click();
      } else if (entry.kind === "html") {
        // Restore the page's own pre-fill child nodes (kept as a DOM clone).
        const nodes = entry.value && entry.value.childNodes
          ? Array.from(entry.value.childNodes).map((node) => node.cloneNode(true))
          : [];
        entry.el.replaceChildren(...nodes);
        entry.el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      } else {
        setNativeValue(entry.el, entry.value);
      }
    } catch (_) {
      /* ignore */
    }
  };

  const shouldSkip = (record, { overwrite, auto, force }) => {
    if (record.kind === "file") return "file";
    if (!hasValue(record.value)) return "no-value";
    if (auto && touched.has(record.el)) return "user-edited";
    if (auto && attemptsFor(record.el, record.value) >= 2) return "tried-twice";
    if (force) return "";
    if (overwrite) return "";
    if (record.kind === "choice") {
      // Every auto pass may re-apply a checkbox/radio group, but not forever.
      if (auto && attemptsFor(record.el, record.value) >= 1) return "already-set";
      return "";
    }
    if (hasMeaningfulValue(record.el)) return "has-value";
    return "";
  };

  const fillRecord = async (record, options = {}) => {
    const skipReason = shouldSkip(record, options);
    if (skipReason) return { ok: false, skipped: true, reason: skipReason };
    const before = options.undo === false ? null : snapshot(record.el);
    selfFilling += 1;
    let result;
    try {
      result = await fillElement(record.el, record.value, {
        ctx: record.ctx,
        mode: record.mode
      });
    } catch (error) {
      result = { ok: false, reason: "error", message: String(error && error.message ? error.message : error) };
    } finally {
      selfFilling = Math.max(0, selfFilling - 1);
    }
    if (options.auto) bumpAttempt(record.el, record.value);
    if (result.ok && before && !result.skipped) {
      if (!undoBatch) undoBatch = { at: Date.now(), entries: [] };
      undoBatch.entries.push(before);
    }
    if (result.ok) flash(record.el, profile);
    return result;
  };

  const fillPage = async ({ overwrite = false, auto = false, force = false } = {}) => {
    ensureTracking();
    const records = scan();
    const startedScroll = { x: window.scrollX, y: window.scrollY };
    const summary = { filled: 0, skipped: 0, failed: 0, total: records.length, messages: [] };
    const batch = { at: Date.now(), entries: [] };
    for (const record of records) {
      if (window.JA_DEBUG) {
        console.log("[Job Autofill]", record.label, {
          value: record.value,
          skip: shouldSkip(record, { overwrite, auto, force }),
          touched: touched.has(record.el),
          attempts: attemptsFor(record.el, record.value)
        });
      }
      if (!hasValue(record.value)) {
        summary.skipped += 1;
        continue;
      }
      if (auto && touched.has(record.el)) {
        summary.skipped += 1;
        continue;
      }
      const before = snapshot(record.el);
      const result = await fillRecord(record, {
        overwrite,
        auto,
        force,
        undo: false
      });
      if (result.ok && !result.skipped) {
        summary.filled += 1;
        if (before) batch.entries.push(before);
      } else if (result.skipped) {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
        if (result.message) summary.messages.push(`${record.label}: ${result.message}`);
      }
      if (result.ok && !result.skipped && record.kind !== "text") await sleep(60);
      else await sleep(25);
    }
    if (batch.entries.length) undoBatch = batch;
    if (auto && (window.scrollX !== startedScroll.x || window.scrollY !== startedScroll.y)) {
      try {
        window.scrollTo(startedScroll.x, startedScroll.y);
      } catch (_) {
        /* ignore */
      }
    }
    return summary;
  };

  const fillById = async (id, value) => {
    let record = recordsById.get(id);
    if (!record || !record.el.isConnected) {
      scan();
      record = recordsById.get(id);
    }
    if (!record) return { ok: false, reason: "not-found", message: "Field is no longer on the page" };
    const target =
      value !== undefined && value !== null && String(value).trim() !== "" ? value : record.value;
    if (Array.isArray(target) ? !target.length : !String(target || "").trim()) {
      return { ok: false, reason: "empty", message: "No value to fill" };
    }
    const before = snapshot(record.el);
    selfFilling += 1;
    let result;
    try {
      result = await fillElement(record.el, target, { ctx: record.ctx, mode: record.mode });
    } catch (error) {
      result = { ok: false, reason: "error", message: String(error && error.message ? error.message : error) };
    } finally {
      selfFilling = Math.max(0, selfFilling - 1);
    }
    if (result.ok && before) {
      if (!undoBatch) undoBatch = { at: Date.now(), entries: [] };
      undoBatch.entries.push(before);
      flash(record.el, profile);
    }
    return result;
  };

  const undo = async () => {
    if (!undoBatch || !undoBatch.entries.length) return { ok: false, message: "Nothing to undo" };
    const entries = undoBatch.entries.splice(0).reverse();
    for (const entry of entries) {
      restoreSnapshot(entry);
      await sleep(30);
    }
    undoBatch = null;
    return { ok: true, restored: entries.length };
  };

  /* ------------------------------------------------------------------ */
  /* Auto-fill                                                           */
  /* ------------------------------------------------------------------ */

  const autoEligible = () => {
    if (!profile) return false;
    if (!profile.settings || !profile.settings.autoFill) return false;
    if (window.JAProfile.isProfileEmpty(profile)) return false;
    if (window.JAProfile.isBlocked(profile, location.hostname)) return false;
    if (document.visibilityState === "hidden") return false;
    if (!/^https?:|^file:/.test(location.protocol)) return false;
    return true;
  };

  const runAuto = async () => {
    if (window.JA_DEBUG) {
      console.log("[Job Autofill] runAuto", {
        hasProfile: Boolean(profile),
        autoFill: Boolean(profile && profile.settings && profile.settings.autoFill),
        empty: profile ? window.JAProfile.isProfileEmpty(profile) : null,
        blocked: profile ? window.JAProfile.isBlocked(profile, location.hostname) : null,
        visibility: document.visibilityState,
        protocol: location.protocol,
        runs: autoRuns
      });
    }
    if (!autoEligible()) return;
    if (autoRuns >= 80) return;
    if (Date.now() - lastAutoRun < 900) return;
    lastAutoRun = Date.now();
    const records = scan();
    const ready = records.filter((record) => hasValue(record.value) && record.ruleId);
    if (window.JA_DEBUG) {
      console.log("[Job Autofill] auto run", ready.map((record) => `${record.label}=${record.value}`));
    }
    // Be conservative: a newsletter box with a name + email should not be
    // filled on every site. Require either job-page signals or a large form.
    const haystack = `${location.href} ${document.title} ${document.referrer}`;
    const jobish =
      /(job|career|apply|application|vacanc|recruit|talent|hiring|resume|curriculo|vaga|emprego)|greenhouse|lever\.co|workday|ashby|smartrecruiters|recruitee|teamtailor|mercor|linkedin\.com\/jobs|indeed/i.test(
        haystack
      );
    if (ready.length < 2) return;
    if (!jobish && ready.length < 6) return;
    autoRuns += 1;
    await fillPage({ auto: true });
  };

  const scheduleAuto = (delay = 900) => {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      autoTimer = null;
      runAuto().catch((error) => console.warn("[Job Autofill] Auto-fill failed", error));
    }, delay);
  };

  const startAuto = () => {
    if (!profile || !profile.settings || !profile.settings.autoFill) return;
    ensureTracking();
    if (!autoObserver) {
      autoObserver = new MutationObserver(() => {
        if (!autoEligible()) return;
        if (autoTimer) return;
        scheduleAuto(950);
      });
      try {
        autoObserver.observe(document.documentElement, {
          childList: true,
          subtree: true
        });
      } catch (_) {
        /* ignore */
      }
    }
    if (!visibilityHooked) {
      visibilityHooked = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") scheduleAuto(500);
      });
    }
    scheduleAuto(700);
  };

  const stopAuto = () => {
    if (autoObserver) {
      autoObserver.disconnect();
      autoObserver = null;
    }
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = null;
  };

  const setProfile = (nextProfile) => {
    profile = nextProfile;
    // A profile edit should get fresh auto-fill attempts.
    attempts = new WeakMap();
    autoRuns = 0;
    if (!profile || !profile.settings || !profile.settings.autoFill) {
      stopAuto();
      return;
    }
    if (profile.settings.autoFillOnNavigation) {
      startAuto();
    } else {
      // Stop watching mutations if the user disabled multi-step support,
      // but still do a single pass for the page that is already open.
      stopAuto();
      scheduleAuto(700);
    }
  };

  const getProfile = () => profile;

  const findFieldForElement = (element) => {
    const el =
      element.closest?.(SELECTOR) ||
      (element.matches?.(SELECTOR) ? element : null);
    if (!el) return null;
    const record = buildRecord(el);
    recordsById.set(record.id, record);
    return { record, description: describe(record) };
  };

  window.JAFiller = {
    describeAll,
    fillById,
    fillElement,
    fillPage,
    findFieldForElement,
    getProfile,
    hasMeaningfulValue,
    hasValue,
    scan,
    scheduleAuto,
    setProfile,
    startAuto,
    stopAuto,
    undo,
    debugState: () => ({
      hasProfile: Boolean(profile),
      autoFill: Boolean(profile && profile.settings && profile.settings.autoFill),
      autoTimer: Boolean(autoTimer),
      autoObserver: Boolean(autoObserver),
      autoRuns,
      lastAutoRun
    }),
    asText,
    pickOption,
    scoreTextMatch,
    choiceVariants,
    visibleOptions,
    setNativeValue
  };
})();
