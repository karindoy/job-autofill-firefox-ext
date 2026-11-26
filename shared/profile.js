/**
 * Shared career profile model.
 *
 * Loaded as a classic script in the background page, content scripts,
 * the popup and the options page. Everything lives on the global
 * `JAProfile` object so no bundler is required.
 */
"use strict";
(() => {
  // In Firefox content scripts `globalThis` is a sandbox object that is
  // distinct from `window` (see MDN: "Content script environment"). All other
  // modules read `window.JAProfile`, so publishing only on `globalThis` makes
  // the content script fail with "window.JAProfile is undefined". Keep
  // `window` as the canonical namespace and mirror it to `globalThis` for
  // modules that prefer it.
  const root = typeof window !== "undefined" ? window : globalThis;
  const expose = (api) => {
    root.JAProfile = api;
    if (typeof globalThis !== "undefined" && globalThis !== root) {
      try {
        globalThis.JAProfile = api;
      } catch (_) {
        /* ignore frozen globals */
      }
    }
  };

  const existing =
    root.JAProfile || (typeof globalThis !== "undefined" ? globalThis.JAProfile : null);
  if (existing) {
    expose(existing);
    return;
  }

  const DEFAULT_PROFILE = {
    version: 1,
    personal: {
      firstName: "",
      middleName: "",
      lastName: "",
      preferredName: "",
      pronouns: "",
      email: "",
      phoneCountry: "Brazil",
      phoneCountryCode: "BR",
      phoneDialCode: "+55",
      phoneNumber: "",
      country: "Brazil",
      countryCode: "BR",
      birthCountry: "",
      city: "",
      state: "",
      address: "",
      postalCode: "",
      dateOfBirth: "",
      nationality: "",
      cpf: "",
      rg: "",
      linkedin: "",
      github: "",
      website: "",
      x: ""
    },
    currentRole: {
      company: "",
      title: "",
      roleCategory: "",
      location: "",
      employmentType: "",
      remote: true,
      startDate: "",
      endDate: "",
      current: true,
      skills: "",
      description: ""
    },
    experience: [],
    education: [],
    skills: {
      primary: "",
      secondary: "",
      extra: ""
    },
    languages: [],
    preferences: {
      expectedSalary: "",
      currency: "USD",
      englishLevel: "Professional working proficiency",
      preferredPlaceOfWork: "Remote",
      totalYears: "",
      totalMonths: "0",
      relevantYears: "",
      relevantMonths: "0",
      noticePeriod: "",
      availableStart: ""
    },
    eligibility: {
      authorizedToWork: "Yes",
      requiresSponsorship: "No",
      gender: "Decline to self-identify",
      ethnicity: "Decline to self-identify",
      veteran: "Decline to self-identify",
      disability: "Decline to self-identify"
    },
    customAnswers: {},
    settings: {
      autoFill: true,
      autoFillOnNavigation: true,
      fillOnlyEmpty: true,
      dateFormat: "MM/DD/YYYY",
      blocklist: "",
      showPanelButton: false,
      highlightFilled: true,
      useFakeCpf: false,
      useFakeRg: false
    }
  };

  const isPlainObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

  const clone = (value) => {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (_) {
        /* fall through to JSON clone */
      }
    }
    return JSON.parse(JSON.stringify(value));
  };

  const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  const merge = (base, extra) => {
    if (Array.isArray(base)) {
      return Array.isArray(extra) ? clone(extra) : clone(base);
    }
    if (!isPlainObject(base)) {
      return extra === undefined ? base : extra;
    }
    const out = {};
    for (const [key, value] of Object.entries(base)) {
      if (UNSAFE_KEYS.has(key)) continue;
      out[key] = merge(value, extra && isPlainObject(extra) ? extra[key] : undefined);
    }
    if (isPlainObject(extra)) {
      for (const [key, value] of Object.entries(extra)) {
        if (UNSAFE_KEYS.has(key)) continue;
        if (!(key in out)) out[key] = clone(value);
      }
    }
    return out;
  };

  const api = () =>
    typeof browser !== "undefined" && browser && browser.storage
      ? browser
      : typeof chrome !== "undefined" && chrome && chrome.storage
        ? chrome
        : null;

  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[*✱•●·]/g, " ")
      .replace(/\((optional|required|obrigat[oó]rio|opcional)\)/g, " ")
      .replace(/[^a-z0-9+@._/-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const splitList = (value) => {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value ?? "")
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const resolvePath = (object, path) => {
    if (!object || !path) return undefined;
    return String(path)
      .split(".")
      .reduce((current, part) => (current == null ? undefined : current[part]), object);
  };

  const setPath = (object, path, value) => {
    const parts = String(path).split(".");
    let current = object;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (current[part] == null || typeof current[part] !== "object") {
        current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
    return object;
  };

  const currentExperience = (profile) => {
    const current = (profile && profile.currentRole) || {};
    const first = (profile && Array.isArray(profile.experience) && profile.experience[0]) || {};
    const isCurrent = current.current !== undefined ? current.current : first.current;
    const pick = (key) => {
      const value = current[key];
      if (Array.isArray(value)) return value.length ? value : first[key] || "";
      return value !== "" && value != null ? value : first[key] || "";
    };
    return {
      company: pick("company"),
      title: pick("title"),
      roleCategory: pick("roleCategory"),
      location: pick("location"),
      employmentType: pick("employmentType"),
      remote: current.remote !== undefined ? current.remote : first.remote,
      startDate: pick("startDate"),
      // A current role has no end date. Falling back to the previous job's
      // end date would tell the form the person already left their job.
      endDate: isCurrent ? String(current.endDate || "") : pick("endDate"),
      current: isCurrent,
      skills: pick("skills"),
      description: pick("description")
    };
  };

  const phoneFull = (profile) => {
    const personal = (profile && profile.personal) || {};
    const number = String(personal.phoneNumber || "").trim();
    const dial = String(personal.phoneDialCode || "").trim();
    if (!number) return "";
    if (number.startsWith("+")) return number;
    if (!dial) return number;
    const numberDigits = number.replace(/\D/g, "");
    const dialDigits = dial.replace(/\D/g, "");
    if (dialDigits && numberDigits.startsWith(dialDigits) && numberDigits.length > dialDigits.length + 4) {
      return `+${numberDigits}`;
    }
    return `${dial.startsWith("+") ? dial : "+" + dial} ${number}`.trim();
  };

  const fullName = (profile) => {
    const personal = (profile && profile.personal) || {};
    return [personal.firstName, personal.middleName, personal.lastName]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" ");
  };

  /* ------------------------------------------------------------------ */
  /* CPF (Brazil)                                                        */
  /* ------------------------------------------------------------------ */

  const cpfDigits = (value) => String(value ?? "").replace(/\D/g, "");

  const formatCpf = (value) => {
    const digits = cpfDigits(value);
    if (digits.length !== 11) return String(value ?? "").trim();
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const cpfCheckDigit = (digits) => {
    const length = digits.length;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const isValidCpf = (value) => {
    const digits = cpfDigits(value);
    if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
    const base = digits.slice(0, 9).split("").map(Number);
    const first = cpfCheckDigit(base);
    if (first !== Number(digits[9])) return false;
    return cpfCheckDigit([...base, first]) === Number(digits[10]);
  };

  const hashString = (value) => {
    let hash = 2166136261;
    const text = String(value ?? "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  // Deterministic, valid-format CPF derived from the profile. It is meant for
  // privacy/testing: stable for the same identity, but it is not an official
  // document and a site that cross-checks public records may reject it.
  const fakeCpf = (profile) => {
    const personal = (profile && profile.personal) || {};
    const seed =
      String(personal.email || "").trim() ||
      fullName(profile) ||
      String(personal.phoneNumber || "").trim() ||
      "job-form-autofill";
    let state = hashString(`cpf:${seed}`) || 1;
    const next = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const base = Array.from({ length: 9 }, () => Math.floor(next() * 10));
    if (base.every((digit) => digit === base[0])) base[8] = (base[8] + 1) % 10;
    const first = cpfCheckDigit(base);
    const second = cpfCheckDigit([...base, first]);
    return formatCpf([...base, first, second].join(""));
  };

  const cpfValue = (profile) => {
    const personal = (profile && profile.personal) || {};
    const useFake = Boolean(profile && profile.settings && profile.settings.useFakeCpf);
    return useFake ? fakeCpf(profile) : formatCpf(personal.cpf);
  };

  /* ------------------------------------------------------------------ */
  /* RG (Brazil)                                                         */
  /* ------------------------------------------------------------------ */

  // RGs vary by state. Keep digits and the possible "X" check digit;
  // everything else is punctuation that only matters for display.
  const rgChars = (value) =>
    String(value ?? "")
      .toUpperCase()
      .replace(/[^0-9X]/g, "");

  const formatRg = (value) => {
    const chars = rgChars(value);
    if (chars.length !== 9) return String(value ?? "").trim();
    return `${chars.slice(0, 2)}.${chars.slice(2, 5)}.${chars.slice(5, 8)}-${chars.slice(8)}`;
  };

  // São Paulo-style check digit (weights 2..9 over the eight base digits).
  // Other states use different rules, so this is only used to keep generated
  // test values internally consistent.
  const rgCheckDigit = (digits) => {
    const base = String(digits ?? "").replace(/\D/g, "");
    let sum = 0;
    for (let index = 0; index < base.length; index += 1) {
      sum += Number(base[index]) * (base.length + 1 - index);
    }
    const digit = 11 - (sum % 11);
    if (digit === 10) return "X";
    if (digit === 11) return "0";
    return String(digit);
  };

  // Deterministic, valid-format RG derived from the profile. Like fakeCpf it
  // is meant for privacy/testing: stable for the same identity, but it is not
  // an official document.
  const fakeRg = (profile) => {
    const personal = (profile && profile.personal) || {};
    const seed =
      String(personal.email || "").trim() ||
      fullName(profile) ||
      String(personal.phoneNumber || "").trim() ||
      "job-form-autofill";
    let state = hashString(`rg:${seed}`) || 1;
    const next = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const base = Array.from({ length: 8 }, () => Math.floor(next() * 10)).join("");
    return formatRg(`${base}${rgCheckDigit(base)}`);
  };

  const rgValue = (profile) => {
    const personal = (profile && profile.personal) || {};
    const useFake = Boolean(profile && profile.settings && profile.settings.useFakeRg);
    return useFake ? fakeRg(profile) : formatRg(personal.rg);
  };

  const withProtocol = (value, fallbackHost) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^https?:\/\//i.test(text)) return text;
    if (!fallbackHost) return text;
    return `https://${fallbackHost}/${text.replace(/^\/+/, "")}`;
  };

  const parseDate = (value) => {
    const text = String(value || "").trim();
    if (!text) return null;
    let match = text.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!match) match = text.match(/^(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?$/);
    if (!match) {
      const monthYear = text.match(/^(\d{1,2})\/(\d{4})$/);
      if (monthYear) {
        const month = Number(monthYear[1]);
        const year = Number(monthYear[2]);
        return month >= 1 && month <= 12 ? { year, month, day: 1 } : null;
      }
      const yearOnly = text.match(/^(\d{4})$/);
      return yearOnly ? { year: Number(yearOnly[1]), month: 1, day: 1 } : null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3] || 1);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  };

  const pad = (number) => String(number).padStart(2, "0");

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  const formatDate = (value, format = "MM/DD/YYYY") => {
    const parts = parseDate(value);
    if (!parts) return "";
    const { year, month, day } = parts;
    switch (format) {
      case "DD/MM/YYYY":
        return `${pad(day)}/${pad(month)}/${year}`;
      case "YYYY-MM-DD":
        return `${year}-${pad(month)}-${pad(day)}`;
      case "MMM YYYY":
        return `${monthNames[month - 1].slice(0, 3)} ${year}`;
      case "MMMM YYYY":
        return `${monthNames[month - 1]} ${year}`;
      case "MM/YYYY":
        return `${pad(month)}/${year}`;
      case "MM/DD/YYYY":
      default:
        return `${pad(month)}/${pad(day)}/${year}`;
    }
  };

  const toISO = (value) => {
    const parts = parseDate(value);
    if (!parts) return "";
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  };

  const toISOMonth = (value) => {
    const parts = parseDate(value);
    if (!parts) return "";
    return `${parts.year}-${pad(parts.month)}`;
  };

  const explicitDatePreference = (profile) =>
    (profile && profile.settings && profile.settings.dateFormat) || "MM/DD/YYYY";

  const catalog = (profile) => {
    const out = [];
    const add = (group, label, value, path = "", kind = "text") => {
      const text = value == null ? "" : String(value).trim();
      if (!text) return;
      out.push({ group, label, value: text, path, kind });
    };
    const personal = (profile && profile.personal) || {};
    const current = currentExperience(profile);
    const preferences = (profile && profile.preferences) || {};
    const eligibility = (profile && profile.eligibility) || {};
    const cpf = cpfValue(profile);
    const cpfDigitsOnly = cpfDigits(cpf);
    const useFakeCpf = Boolean(profile && profile.settings && profile.settings.useFakeCpf);
    const rg = rgValue(profile);
    const rgCharsOnly = rgChars(rg);
    const useFakeRg = Boolean(profile && profile.settings && profile.settings.useFakeRg);

    add("Personal", "Full name", fullName(profile), "personal.fullName");
    add("Personal", "First name", personal.firstName, "personal.firstName");
    add("Personal", "Middle name", personal.middleName, "personal.middleName");
    add("Personal", "Last name", personal.lastName, "personal.lastName");
    add("Personal", "Preferred name", personal.preferredName, "personal.preferredName");
    add("Personal", "Pronouns", personal.pronouns, "personal.pronouns");
    add("Personal", "Email", personal.email, "personal.email");
    add("Personal", "Phone", phoneFull(profile), "personal.phone");
    add("Personal", "Phone country code", personal.phoneDialCode, "personal.phoneDialCode");
    add("Personal", "Country", personal.country, "personal.country");
    add("Personal", "Country of birth", personal.birthCountry, "personal.birthCountry");
    add("Personal", "Country code", personal.countryCode, "personal.countryCode");
    add("Personal", "City", personal.city, "personal.city");
    add("Personal", "State / province", personal.state, "personal.state");
    add("Personal", "Address", personal.address, "personal.address");
    add("Personal", "Postal code", personal.postalCode, "personal.postalCode");
    add("Personal", "Date of birth", formatDate(personal.dateOfBirth, "MM/DD/YYYY"), "personal.dateOfBirth");
    add("Personal", "Nationality", personal.nationality, "personal.nationality");
    add("Personal", useFakeCpf ? "CPF (fake)" : "CPF", cpf, "personal.cpf");
    if (cpfDigitsOnly.length === 11) {
      add("Personal", "CPF (digits only)", cpfDigitsOnly, "personal.cpf");
    }
    add("Personal", useFakeRg ? "RG (fake)" : "RG", rg, "personal.rg");
    if (/^\d{9}$/.test(rgCharsOnly)) {
      add("Personal", "RG (digits only)", rgCharsOnly, "personal.rg");
    }
    add("Personal", "LinkedIn", personal.linkedin, "personal.linkedin");
    add("Personal", "GitHub", personal.github, "personal.github");
    add("Personal", "Website", personal.website, "personal.website");
    add("Personal", "X / Twitter", personal.x, "personal.x");

    add("Current role", "Most recent employer", current.company, "currentRole.company");
    add("Current role", "Job title", current.title, "currentRole.title");
    add("Current role", "Role category", current.roleCategory, "currentRole.roleCategory");
    add("Current role", "Company location", current.location, "currentRole.location");
    add("Current role", "Employment type", current.employmentType, "currentRole.employmentType");
    add("Current role", "Start date", formatDate(current.startDate, "MM/YYYY"), "currentRole.startDate");
    add("Current role", "End date", formatDate(current.endDate, "MM/YYYY"), "currentRole.endDate");
    add("Current role", "Current role description", current.description, "currentRole.description");
    splitList(current.skills).forEach((skill) =>
      add("Current role", `Skill: ${skill}`, skill, "currentRole.skills", "skill")
    );

    (Array.isArray(profile && profile.experience) ? profile.experience : []).forEach((job, index) => {
      const prefix = `Experience ${index + 1}`;
      add("Experience", `${prefix}: company`, job.company, `experience.${index}.company`);
      add("Experience", `${prefix}: title`, job.title, `experience.${index}.title`);
      add("Experience", `${prefix}: location`, job.location, `experience.${index}.location`);
      add("Experience", `${prefix}: employment type`, job.employmentType, `experience.${index}.employmentType`);
      add("Experience", `${prefix}: start date`, formatDate(job.startDate, "MM/YYYY"), `experience.${index}.startDate`);
      add("Experience", `${prefix}: end date`, formatDate(job.endDate, "MM/YYYY"), `experience.${index}.endDate`);
      add("Experience", `${prefix}: description`, job.description, `experience.${index}.description`);
      splitList(job.skills).forEach((skill) =>
        add("Experience", `${prefix}: skill ${skill}`, skill, `experience.${index}.skills`, "skill")
      );
    });

    (Array.isArray(profile && profile.education) ? profile.education : []).forEach((item, index) => {
      const prefix = `Education ${index + 1}`;
      add("Education", `${prefix}: school`, item.school, `education.${index}.school`);
      add("Education", `${prefix}: degree`, item.degree, `education.${index}.degree`);
      add("Education", `${prefix}: field of study`, item.field, `education.${index}.field`);
      add("Education", `${prefix}: start date`, formatDate(item.startDate, "MM/YYYY"), `education.${index}.startDate`);
      add("Education", `${prefix}: end date`, formatDate(item.endDate, "MM/YYYY"), `education.${index}.endDate`);
    });

    const skillList = [
      ...splitList(profile && profile.skills && profile.skills.primary),
      ...splitList(profile && profile.skills && profile.skills.secondary),
      ...splitList(profile && profile.skills && profile.skills.extra)
    ];
    [...new Set(skillList)].forEach((skill) =>
      add("Skills", `Skill: ${skill}`, skill, "skills", "skill")
    );

    (Array.isArray(profile && profile.languages) ? profile.languages : []).forEach((item, index) => {
      if (item.language) {
        add(
          "Languages",
          `${item.language} level`,
          item.level,
          `languages.${index}.level`
        );
      }
    });

    add("Preferences", "Expected compensation", preferences.expectedSalary, "preferences.expectedSalary");
    add("Preferences", "Currency", preferences.currency, "preferences.currency");
    add("Preferences", "English level", preferences.englishLevel, "preferences.englishLevel");
    add("Preferences", "Preferred place of work", preferences.preferredPlaceOfWork, "preferences.preferredPlaceOfWork");
    add("Preferences", "Years of experience", preferences.totalYears, "preferences.totalYears");
    add("Preferences", "Months of experience", preferences.totalMonths, "preferences.totalMonths");
    add("Preferences", "Relevant years in primary skill", preferences.relevantYears, "preferences.relevantYears");
    add("Preferences", "Relevant months in primary skill", preferences.relevantMonths, "preferences.relevantMonths");
    add("Preferences", "Notice period", preferences.noticePeriod, "preferences.noticePeriod");
    add("Preferences", "Available to start", preferences.availableStart, "preferences.availableStart");

    add("Eligibility", "Authorized to work", eligibility.authorizedToWork, "eligibility.authorizedToWork");
    add("Eligibility", "Requires visa sponsorship", eligibility.requiresSponsorship, "eligibility.requiresSponsorship");
    add("Eligibility", "Gender", eligibility.gender, "eligibility.gender");
    add("Eligibility", "Race / ethnicity", eligibility.ethnicity, "eligibility.ethnicity");
    add("Eligibility", "Veteran status", eligibility.veteran, "eligibility.veteran");
    add("Eligibility", "Disability status", eligibility.disability, "eligibility.disability");

    Object.entries((profile && profile.customAnswers) || {}).forEach(([key, value]) => {
      add("Saved answers", `Saved: ${key}`, value, `customAnswers.${key}`, "custom");
    });

    return out;
  };

  const customKey = (label) =>
    normalizeText(label)
      .replace(/^(please|kindly)\s+/, "")
      .replace(/\s+(optional|required)$/, "")
      .slice(0, 90)
      .trim();

  const findCustomAnswer = (profile, labelTexts) => {
    const answers = (profile && profile.customAnswers) || {};
    const candidates = (Array.isArray(labelTexts) ? labelTexts : [labelTexts])
      .map((text) => normalizeText(text))
      .filter((text) => text.length >= 3);
    if (!candidates.length) return null;

    let best = null;
    for (const [rawKey, rawValue] of Object.entries(answers)) {
      const value = String(rawValue ?? "").trim();
      if (!value) continue;
      const key = normalizeText(rawKey);
      if (!key) continue;
      for (const label of candidates) {
        let score = 0;
        if (label === key) score = 1;
        else if (key.length >= 6 && label.includes(key)) score = 0.86;
        else if (label.length >= 6 && key.includes(label)) score = 0.8;
        else {
          const keyTokens = new Set(key.split(" ").filter((token) => token.length > 2));
          const labelTokens = new Set(label.split(" ").filter((token) => token.length > 2));
          if (keyTokens.size && labelTokens.size) {
            let shared = 0;
            for (const token of keyTokens) if (labelTokens.has(token)) shared += 1;
            const ratio = shared / Math.max(keyTokens.size, labelTokens.size);
            if (ratio >= 0.8) score = 0.7;
          }
        }
        if (score > (best ? best.score : 0)) best = { key: rawKey, value, score };
      }
    }
    return best;
  };

  const COMPLETENESS_FIELDS = [
    ["First name", (p) => p.personal.firstName],
    ["Last name", (p) => p.personal.lastName],
    ["Email", (p) => p.personal.email],
    ["Phone", (p) => p.personal.phoneNumber],
    ["City", (p) => p.personal.city],
    ["Country", (p) => p.personal.country],
    ["Current employer", (p) => p.currentRole.company || (p.experience[0] && p.experience[0].company)],
    ["Current job title", (p) => p.currentRole.title || (p.experience[0] && p.experience[0].title)],
    ["Primary skill", (p) => p.skills.primary],
    ["Professional experience", (p) => p.preferences.totalYears]
  ];

  const completeness = (profile) => {
    const missing = [];
    let filled = 0;
    for (const [label, getter] of COMPLETENESS_FIELDS) {
      let value = "";
      try {
        value = getter(profile);
      } catch (_) {
        value = "";
      }
      if (String(value || "").trim()) filled += 1;
      else missing.push(label);
    }
    return {
      percent: Math.round((filled / COMPLETENESS_FIELDS.length) * 100),
      filled,
      total: COMPLETENESS_FIELDS.length,
      missing
    };
  };

  const isProfileEmpty = (profile) => {
    if (!profile) return true;
    const p = profile.personal || {};
    return !p.firstName && !p.lastName && !p.email && !p.phoneNumber && !(profile.currentRole || {}).company;
  };

  const load = async () => {
    const storage = api();
    if (!storage) return merge(DEFAULT_PROFILE, {});
    try {
      const result = await storage.storage.local.get("profile");
      return merge(DEFAULT_PROFILE, (result && result.profile) || {});
    } catch (error) {
      console.warn("[Job Autofill] Could not load profile", error);
      return merge(DEFAULT_PROFILE, {});
    }
  };

  const save = async (profile, { silent = false } = {}) => {
    const storage = api();
    const normalized = merge(DEFAULT_PROFILE, profile);
    if (!storage) {
      if (!silent) console.warn("[Job Autofill] Storage API unavailable; profile not saved");
      return normalized;
    }
    await storage.storage.local.set({ profile: normalized });
    return normalized;
  };

  const onChanged = (callback) => {
    const listener = (changes, area) => {
      if (area !== "local" || !changes.profile) return;
      const next = merge(DEFAULT_PROFILE, changes.profile.newValue || {});
      callback(next);
    };
    if (typeof browser !== "undefined" && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener(listener);
    } else if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(listener);
    }
  };

  const isBlocked = (profile, hostname) => {
    const host = String(hostname || "").toLowerCase();
    if (!host) return false;
    const entries = String((profile && profile.settings && profile.settings.blocklist) || "")
      .split(/[\n,]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    return entries.some((entry) => {
      const clean = entry.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!clean) return false;
      return host === clean || host.endsWith(`.${clean}`);
    });
  };

  expose({
    DEFAULT_PROFILE,
    clone,
    merge,
    normalizeText,
    splitList,
    resolvePath,
    setPath,
    currentExperience,
    phoneFull,
    fullName,
    cpfDigits,
    formatCpf,
    isValidCpf,
    fakeCpf,
    cpfValue,
    rgChars,
    formatRg,
    rgCheckDigit,
    fakeRg,
    rgValue,
    withProtocol,
    parseDate,
    formatDate,
    toISO,
    toISOMonth,
    explicitDatePreference,
    catalog,
    customKey,
    findCustomAnswer,
    completeness,
    isProfileEmpty,
    load,
    save,
    onChanged,
    isBlocked
  });
})();
