/**
 * Field-matching rules.
 *
 * Every rule describes one question that a job application might ask,
 * the label patterns that identify it, and how to read the answer from
 * the saved career profile. Scoring is intentionally forgiving: labels
 * are compared after accent/case/punctuation normalization and each
 * label source carries a confidence weight.
 */
"use strict";
(() => {
  if (window.JARules) return;
  const {
    normalizeText,
    splitList,
    currentExperience,
    phoneFull,
    fullName,
    withProtocol,
    formatCpf,
    fakeCpf,
    cpfValue
  } = window.JAProfile;

  const RULES = [];

  const rule = (definition) => {
    const item = {
      priority: 50,
      patterns: [],
      exclude: [],
      nameHints: [],
      autocomplete: [],
      mode: "text",
      groups: [],
      ...definition
    };
    RULES.push(item);
    return item;
  };

  const yes = (value) =>
    value === true ||
    value === 1 ||
    /^(yes|true|y|1|sim|authorized|eligible)$/i.test(String(value || "").trim());

  const no = (value) => (value === false || value === 0 || /^(no|false|n|0|nao)$/i.test(String(value || "").trim()));

  const boolValue = (value) => (yes(value) ? true : no(value) ? false : "");

  const personal = (profile) => (profile && profile.personal) || {};
  const prefs = (profile) => (profile && profile.preferences) || {};
  const eligibility = (profile) => (profile && profile.eligibility) || {};
  const current = (profile) => currentExperience(profile);

  // Work-history editors render the same block several times (company, title,
  // dates, description). filler.js numbers the repeats; this picks the entry
  // that belongs to the current block. Without a sequence (a normal single
  // form) the current role is used, which is the old behaviour.
  const sequenceEntry = (profile, ctx) => {
    const index = ctx && Number.isInteger(ctx.sequenceIndex) ? ctx.sequenceIndex : -1;
    const total = ctx && Number.isInteger(ctx.sequenceTotal) ? ctx.sequenceTotal : 0;
    if (total <= 1 || index < 0) return current(profile);
    const list = [];
    // "Empregos anteriores" / "Previous jobs" start at the first previous
    // role; everything else (current + previous) starts at the current role.
    if (!ctx || ctx.sequenceMode !== "previous") list.push(current(profile));
    for (const job of Array.isArray(profile && profile.experience) ? profile.experience : []) {
      list.push(job || {});
    }
    return list[index] || {};
  };

  const jobSuggestions = (profile, key, labelKey) => {
    const out = [];
    const latest = current(profile);
    if (latest[key]) out.push({ label: `Current: ${latest[labelKey || key]}`, value: latest[key] });
    (Array.isArray(profile && profile.experience) ? profile.experience : []).forEach((job, index) => {
      if (job[key]) {
        out.push({
          label: `${job.company || `Experience ${index + 1}`} — ${job[labelKey || key] || key}`,
          value: job[key]
        });
      }
    });
    return out;
  };

  const allSkills = (profile) => {
    const skills = profile && profile.skills ? profile.skills : {};
    return [...new Set([...splitList(skills.primary), ...splitList(skills.secondary), ...splitList(skills.extra)])];
  };

  const skillSuggestions = (profile) =>
    allSkills(profile).map((skill) => ({ label: skill, value: skill, group: "Skills" }));

  /* ------------------------------------------------------------------ */
  /* Identity and contact                                                */
  /* ------------------------------------------------------------------ */

  rule({
    id: "personal.pronouns",
    label: "Preferred pronouns",
    priority: 95,
    patterns: [/\bpronouns?\b/, /\bpreferred pronouns?\b/],
    nameHints: ["pronouns", "pronoun"],
    mode: "choice",
    groups: ["Personal"],
    value: (p) => personal(p).pronouns,
    suggest: () => [
      { label: "She/Her", value: "She/Her" },
      { label: "He/Him", value: "He/Him" },
      { label: "They/Them", value: "They/Them" }
    ]
  });

  rule({
    id: "personal.email",
    label: "Email",
    priority: 100,
    patterns: [/\be-?mail\b/, /\bcorreo\b/, /correio\s+eletronico/],
    nameHints: ["email", "e mail", "mail"],
    autocomplete: ["email"],
    exclude: [/future\s+roles?/, /newsletter/, /updates?/, /alerts?/, /notify/, /marketing/, /subscribe/, /job\s+alerts?/],
    value: (p) => personal(p).email
  });

  rule({
    id: "personal.phoneCountryCode",
    label: "Phone country code",
    priority: 135,
    patterns: [/country\s*(code|prefix)/, /dial(ing)?\s*code/, /phone\s*country/, /^ddd$/],
    nameHints: ["country code", "dial code", "phone country", "countrycode"],
    when: (ctx) =>
      /\b(phone|telephone|mobile|dial|prefix|ddd|ddi|discagem|whatsapp|telefone|celular)\b/.test(ctx.text) ||
      (/\+/.test(ctx.optionsText) && /\d/.test(ctx.optionsText)) ||
      /\b(phone|tel|dial|mobile)\b/.test(ctx.nameString),
    mode: "choice",
    value: (p) => personal(p).phoneDialCode || personal(p).phoneCountryCode,
    suggest: (p) => [
      { label: personal(p).phoneDialCode || "+55", value: personal(p).phoneDialCode || "+55" },
      { label: "Brazil (+55)", value: "+55" },
      { label: "United States (+1)", value: "+1" },
      { label: "Portugal (+351)", value: "+351" }
    ]
  });

  rule({
    id: "personal.countryCode",
    label: "Country code (ISO)",
    priority: 124,
    patterns: [/^country\s*(iso|code)$/, /^iso\s*(country\s*)?code$/],
    nameHints: ["country code", "countrycode", "iso country"],
    mode: "choice",
    exclude: [/phone/, /dial/, /telephone/],
    value: (p) => personal(p).countryCode,
    suggest: (p) => [
      { label: personal(p).countryCode || "BR", value: personal(p).countryCode || "BR" },
      { label: "BR", value: "BR" },
      { label: "US", value: "US" },
      { label: "PT", value: "PT" }
    ]
  });

  rule({
    id: "personal.phone",
    label: "Phone number",
    priority: 120,
    patterns: [/\b(phone|mobile|telephone|cell|whatsapp)\b/, /telefone|celular/],
    nameHints: ["phone", "mobile", "telephone", "tel", "cell", "whatsapp"],
    autocomplete: ["tel", "tel-national"],
    exclude: [/country\s*code/, /dial\s*code/, /\bext(ension)?\b/],
    value: (p) => phoneFull(p)
  });

  rule({
    id: "personal.firstName",
    label: "First name",
    priority: 110,
    patterns: [/^first\s*names?\b/, /^given\s*names?\b/, /^forename\b/, /^first$/, /^primeiro\s+nome\b/],
    nameHints: ["first name", "firstname", "given name", "fname"],
    autocomplete: ["given-name"],
    exclude: [/last\s*name/, /family\s*name/, /surname/],
    value: (p) => personal(p).firstName
  });

  rule({
    id: "personal.middleName",
    label: "Middle name",
    priority: 100,
    patterns: [/^middle\s*(name|initial)\b/, /^nome\s+do\s+meio\b/],
    nameHints: ["middle name", "middlename", "middle initial"],
    autocomplete: ["additional-name"],
    value: (p) => personal(p).middleName
  });

  rule({
    id: "personal.preferredName",
    label: "Preferred name",
    priority: 100,
    patterns: [/^preferred\s*(first\s*)?name\b/, /^display\s*name\b/, /^nickname\b/, /^nome\s+social\b/],
    nameHints: ["preferred name", "preferredname", "display name", "nickname"],
    value: (p) => personal(p).preferredName || personal(p).firstName
  });

  rule({
    id: "personal.lastName",
    label: "Last name",
    priority: 110,
    patterns: [/^last\s*names?\b/, /^family\s*names?\b/, /^surname\b/, /^last$/, /^sobrenome\b/],
    nameHints: ["last name", "lastname", "family name", "surname", "lname"],
    autocomplete: ["family-name"],
    exclude: [/first\s*name/, /given\s*name/],
    value: (p) => personal(p).lastName
  });

  rule({
    id: "personal.fullName",
    label: "Full name",
    priority: 95,
    patterns: [
      /^full\s*names?\b/,
      /^legal\s+name\b/,
      /^your\s+name\b/,
      /^name$/,
      /^nome\s+completo\b/,
      /^nome\s+e\s+sobrenome\b/
    ],
    nameHints: ["full name", "fullname", "legal name", "nome completo"],
    autocomplete: ["name"],
    exclude: [/first|last|family|company|user|file|search|nick|responsavel|father|mother|parent/],
    value: (p) => fullName(p)
  });

  rule({
    id: "personal.cpf",
    label: "CPF",
    priority: 140,
    patterns: [/^cpf$/, /\bcpf\b/, /cadastro\s+de\s+pessoa/],
    nameHints: ["cpf", "documento", "document"],
    exclude: [/cnpj/, /company|empresa|responsavel/],
    mode: "cpf",
    value: (p) => cpfValue(p),
    suggest: (p) => {
      const out = [];
      const fake = fakeCpf(p);
      if (fake) out.push({ label: "Fake CPF (valid format)", value: fake });
      const saved = formatCpf(p && p.personal && p.personal.cpf);
      if (saved && saved !== fake) out.push({ label: "Saved CPF", value: saved });
      return out;
    }
  });

  rule({
    id: "personal.linkedin",
    label: "LinkedIn",
    priority: 120,
    patterns: [/linkedin/],
    nameHints: ["linkedin"],
    value: (p) => {
      const raw = personal(p).linkedin;
      if (!raw) return "";
      return raw.includes(".") ? withProtocol(raw) : `https://linkedin.com/in/${raw.replace(/^\/+/, "")}`;
    }
  });

  rule({
    id: "personal.github",
    label: "GitHub",
    priority: 120,
    patterns: [/github/],
    nameHints: ["github"],
    value: (p) => {
      const raw = personal(p).github;
      if (!raw) return "";
      return raw.includes(".") ? withProtocol(raw) : `https://github.com/${raw.replace(/^\/+/, "")}`;
    }
  });

  rule({
    id: "personal.x",
    label: "X / Twitter profile",
    priority: 115,
    patterns: [/twitter/, /^x\s*(profile|handle|url|username)$/, /\bx\.com\b/],
    nameHints: ["twitter", "xprofile", "xhandle", "xurl"],
    value: (p) => {
      const raw = personal(p).x;
      if (!raw) return "";
      return raw.includes(".") ? withProtocol(raw) : `https://x.com/${raw.replace(/^\/+/, "")}`;
    }
  });

  rule({
    id: "personal.website",
    label: "Website / portfolio",
    priority: 80,
    patterns: [/\bportfolio\b/, /\bpersonal\s+(web)?site\b/, /\bwebsite\b/, /\bhomepage\b/, /\bblog\b/],
    nameHints: ["website", "portfolio", "homepage", "blog"],
    exclude: [/linkedin/, /github/, /twitter/, /company/, /x\.com/],
    value: (p) => withProtocol(personal(p).website)
  });

  rule({
    id: "personal.country",
    label: "Country",
    priority: 115,
    patterns: [
      /^country\b(?!\s*(code|prefix))/,
      /^country\s+of\s+(residence|origin)/,
      /\bcountry\s+of\s+residence\b/,
      /\b(which|what)\s+country\s+(do\s+you\s+(live|reside)|are\s+you\s+(based|located|residing))\b/,
      /\bcountry\s+(that\s+)?you\s+(live|reside)\s+in\b/,
      /^pais\b/
    ],
    nameHints: ["country", "pais", "country of residence"],
    autocomplete: ["country", "country-name"],
    mode: "choice",
    exclude: [/country\s*code/, /phone/, /dial/],
    value: (p) => personal(p).country,
    suggest: (p) => [
      { label: personal(p).country || "Brazil", value: personal(p).country || "Brazil" },
      { label: "Brazil", value: "Brazil" },
      { label: "United States", value: "United States" },
      { label: "Portugal", value: "Portugal" },
      { label: "Canada", value: "Canada" }
    ]
  });

  rule({
    id: "personal.birthCountry",
    label: "Country of birth",
    priority: 118,
    patterns: [
      /\bcountry\s+of\s+birth\b/,
      /\bbirth\s*country\b/,
      /\bcountry\s+of\s+origin\b/,
      /\b(which|what)\s+country\s+(were|was)\s+you\s+born\b/,
      /\bcountry\s+(that\s+)?you\s+were\s+born\s+in\b/,
      /\bwhere\s+(were|was)\s+you\s+born\b/,
      /\bnaturality\b/
    ],
    nameHints: ["birth country", "country of birth", "birthplace", "naturality"],
    mode: "choice",
    value: (p) => personal(p).birthCountry || personal(p).country || personal(p).nationality
  });

  rule({
    id: "personal.city",
    label: "City",
    priority: 110,
    patterns: [/^city\b/, /^town\b/, /^cidade\b/, /^location\s*\(city\)/, /\bcurrent\s+location\b/, /\bwhere\s+(are\s+you|do\s+you\s+live|are\s+you\s+based)\b/, /^localizacao\s+atual$/],
    nameHints: ["city", "town", "cidade", "address level2"],
    autocomplete: ["address-level2"],
    value: (p) => personal(p).city || current(p).location
  });

  rule({
    id: "personal.state",
    label: "State / province",
    priority: 100,
    patterns: [/^state\b/, /^province\b/, /^estado\b/, /^region$/],
    nameHints: ["state", "province", "region", "address level1"],
    autocomplete: ["address-level1"],
    exclude: [/statement/, /status/],
    value: (p) => personal(p).state
  });

  rule({
    id: "personal.address",
    label: "Street address",
    priority: 95,
    patterns: [/^address(\s+line)?\s*1?\b/, /\bstreet\s+address\b/, /^endereco\b/],
    nameHints: ["address", "address line1", "street address"],
    autocomplete: ["street-address", "address-line1"],
    exclude: [/email/, /ip\b/],
    value: (p) => personal(p).address
  });

  rule({
    id: "personal.postalCode",
    label: "Postal code",
    priority: 110,
    patterns: [/\b(postal|zip)\s*(code)?\b/, /^cep$/],
    nameHints: ["postal", "postal code", "zip", "zipcode", "cep"],
    autocomplete: ["postal-code"],
    value: (p) => personal(p).postalCode
  });

  rule({
    id: "personal.dateOfBirth",
    label: "Date of birth",
    priority: 100,
    patterns: [/\bdate\s+of\s+birth\b/, /\bbirth\s*(date|day)\b/, /\bbirthday\b/, /nascimento/],
    nameHints: ["birth", "birthday", "dob", "date of birth"],
    autocomplete: ["bday"],
    mode: "date",
    value: (p) => personal(p).dateOfBirth
  });

  rule({
    id: "personal.nationality",
    label: "Nationality",
    priority: 90,
    patterns: [/\bnationality\b/, /\bcitizenship\b/],
    nameHints: ["nationality", "citizenship"],
    value: (p) => personal(p).nationality || personal(p).country
  });

  /* ------------------------------------------------------------------ */
  /* Current role                                                        */
  /* ------------------------------------------------------------------ */

  rule({
    id: "current.company",
    label: "Company name",
    priority: 115,
    patterns: [/^company\s*name$/, /^company$/, /^employer$/, /most\s+recent\s+employer/, /current\s+employer/, /^organization$/, /^organisation$/, /^empresa$/],
    nameHints: ["company", "employer", "organization", "organisation", "company name"],
    exclude: [/website/, /\burl\b/, /location/, /industry/, /\btitles?\b/],
    value: (p, ctx) => sequenceEntry(p, ctx).company || "",
    suggest: (p) => jobSuggestions(p, "company")
  });

  rule({
    id: "current.title",
    label: "Job title",
    priority: 118,
    patterns: [/^job\s*title\b/, /^title\b/, /^position(\s*title)?\b/, /^role$/, /current\s+(job\s+)?title$/, /^cargo$/],
    nameHints: ["job title", "jobtitle", "position", "title", "cargo"],
    exclude: [/role\s*category/, /page\s*title/, /company/],
    value: (p, ctx) => sequenceEntry(p, ctx).title || "",
    suggest: (p) => jobSuggestions(p, "title")
  });

  rule({
    id: "current.roleCategory",
    label: "Role category",
    priority: 125,
    patterns: [/role\s*category/, /closest\s*role/, /job\s*(function|family)/, /^role\s*type$/, /categoria\s+do\s+cargo/, /area\s+de\s+atuacao/],
    nameHints: ["role category", "rolecategory", "job function", "job family"],
    mode: "choice",
    value: (p) => current(p).roleCategory || current(p).title,
    suggest: (p) => [
      { label: "Software Engineer", value: "Software Engineer" },
      { label: "Backend Engineer", value: "Backend Engineer" },
      { label: "Full Stack Engineer", value: "Full Stack Engineer" },
      { label: "Data Engineer", value: "Data Engineer" },
      { label: "Engineering Manager", value: "Engineering Manager" },
      ...jobSuggestions(p, "roleCategory")
    ]
  });

  rule({
    id: "current.location",
    label: "Company location",
    priority: 90,
    patterns: [/^company\s*location$/, /^job\s*location$/, /^office\s*location$/, /^location$/, /local\s+da\s+empresa/, /^localizacao$/],
    nameHints: ["company location", "job location", "office location", "location"],
    exclude: [/preferred/, /place\s+of\s+work/, /country/, /relocat/],
    value: (p, ctx) => sequenceEntry(p, ctx).location || personal(p).city
  });

  rule({
    id: "current.remote",
    label: "Remote position",
    priority: 105,
    patterns: [/remote\s*(position|role|work|job)?/, /this\s+is\s+a\s+remote/, /work\s+from\s+home/, /telecommute/, /\bremoto\b/, /trabalho\s+remoto/],
    nameHints: ["remote", "isremote", "remote position", "work from home"],
    exclude: [/preferred/, /preference/, /relocat/],
    mode: "boolean",
    value: (p, ctx) => {
      const value = sequenceEntry(p, ctx).remote;
      return value === undefined ? "" : Boolean(value);
    }
  });

  rule({
    id: "current.startDate",
    label: "Start date",
    priority: 100,
    patterns: [/^start\s*date/, /^from\b/, /^date\s+of\s+joining/, /^joining\s+date/, /data\s*(de\s*)?inicio/],
    nameHints: ["start date", "startdate", "from date", "joining date"],
    exclude: [/end\s*date/, /available/, /when\s+can/],
    mode: "date",
    value: (p, ctx) => sequenceEntry(p, ctx).startDate || ""
  });

  rule({
    id: "current.endDate",
    label: "End date",
    priority: 100,
    patterns: [/^end\s*date/, /^to\s*date$/, /^date\s+of\s+leaving/, /^termination\s+date/, /data\s*(de\s*)?(fim|termino)/],
    nameHints: ["end date", "enddate", "to date", "leaving date"],
    exclude: [/start\s*date/],
    mode: "date",
    value: (p, ctx) => sequenceEntry(p, ctx).endDate || ""
  });

  rule({
    id: "current.current",
    label: "I currently work here",
    priority: 125,
    patterns: [/currently\s+(work|working|employed)/, /i\s+currently\s+work/, /current\s+(position|role|employment)/, /^present$/, /trabalho\s+atualmente/, /atuo\s+atualmente/, /emprego\s+atual/],
    nameHints: ["current role", "iscurrent", "currently employed"],
    exclude: [/company/, /employer/, /title/, /location/, /city/, /country/, /address/, /where/, /salary/],
    mode: "boolean",
    value: (p, ctx) => Boolean(sequenceEntry(p, ctx).current)
  });

  rule({
    id: "current.employmentType",
    label: "Employment type",
    priority: 122,
    patterns: [
      /relacao\s+de\s+emprego/,
      /regime\s+de\s+contratacao/,
      /tipo\s+de\s+contratacao/,
      /vinculo\s+(empregaticio|trabalhista|de\s+trabalho)/,
      /employment\s+(type|relationship)/,
      /contract\s+type/,
      /job\s+type/
    ],
    nameHints: ["employment type", "employmenttype", "contract type", "relacao de emprego", "vinculo"],
    mode: "choice",
    value: (p, ctx) => sequenceEntry(p, ctx).employmentType || "",
    suggest: () => [
      { label: "CLT", value: "CLT" },
      { label: "PJ", value: "PJ" },
      { label: "Estágio", value: "Estágio" },
      { label: "Aprendiz", value: "Aprendiz" },
      { label: "Freelancer", value: "Freelancer" },
      { label: "Autônomo", value: "Autônomo" },
      { label: "Temporário", value: "Temporário" },
      { label: "Full-time", value: "Full-time" },
      { label: "Part-time", value: "Part-time" },
      { label: "Contract", value: "Contract" },
      { label: "Internship", value: "Internship" }
    ]
  });

  rule({
    id: "current.description",
    label: "Role description",
    priority: 100,
    patterns: [/^description$/, /^job\s*description$/, /responsibilities/, /responsabilidades/, /what\s+did\s+you\s+(do|achieve)/, /summary\s+of\s+(your\s+)?(role|experience)/, /^descricao$/, /atividades\s+(desenvolvidas|realizadas)/],
    nameHints: ["description", "responsibilities", "job description", "summary"],
    exclude: [/company/, /role\s*category/, /cover\s*letter/],
    mode: "richtext",
    value: (p, ctx) => sequenceEntry(p, ctx).description || "",
    suggest: (p) => {
      const out = [];
      if (current(p).description) {
        out.push({ label: "Current role description", value: current(p).description });
      }
      (Array.isArray(p.experience) ? p.experience : []).forEach((job) => {
        if (job.description) {
          out.push({ label: `${job.company || "Experience"} — description`, value: job.description });
        }
      });
      return out;
    }
  });

  rule({
    id: "current.skills",
    label: "Skills used in this position",
    priority: 115,
    patterns: [/skills?\s+(used|for)\s+(in\s+)?(this|the)\s+(position|role)/, /^skills$/, /^skills\s+used$/, /^technical\s+skills$/, /habilidades?\s+(usadas|utilizadas)/],
    nameHints: ["skills", "skills used", "position skills"],
    mode: "tags",
    value: (p, ctx) => splitList(sequenceEntry(p, ctx).skills),
    suggest: (p) => skillSuggestions(p)
  });

  /* ------------------------------------------------------------------ */
  /* Experience totals and skills                                        */
  /* ------------------------------------------------------------------ */

  rule({
    id: "experience.totalPair",
    label: "Total professional experience",
    priority: 95,
    patterns: [/^total\s+(professional\s+)?experience$/, /^professional\s+experience$/, /^total\s+experience$/, /^experiencia\s+(profissional|total)$/],
    mode: "choice",
    value: (p, ctx) => {
      const hint = `${ctx.nameString} ${ctx.labels.map((label) => label.text).join(" ")}`.toLowerCase();
      if (/\bmonths?\b|\bmeses?\b|\bmes\b/.test(hint) && !/\byears?\b|\banos?\b/.test(hint)) {
        return prefs(p).totalMonths || "0";
      }
      if (/\byears?\b|\banos?\b|\bano\b/.test(hint) && !/\bmonths?\b|\bmeses?\b/.test(hint)) {
        return prefs(p).totalYears;
      }
      const index = ctx.group.index;
      if (index === 0) return prefs(p).totalYears;
      if (index === 1) return prefs(p).totalMonths || "0";
      return "";
    },
    suggest: (p) => [
      { label: `${prefs(p).totalYears || "0"} years`, value: prefs(p).totalYears || "0" },
      { label: `${prefs(p).totalMonths || "0"} months`, value: prefs(p).totalMonths || "0" }
    ]
  });

  rule({
    id: "experience.relevantPair",
    label: "Relevant experience in primary skill",
    priority: 95,
    patterns: [/^relevant\s+experience(\s+in\s+(the\s+)?primary\s+skill)?$/, /^experience\s+in\s+(the\s+)?primary\s+skill$/, /^experiencia\s+relevante/],
    mode: "choice",
    value: (p, ctx) => {
      const hint = `${ctx.nameString} ${ctx.labels.map((label) => label.text).join(" ")}`.toLowerCase();
      if (/\bmonths?\b|\bmeses?\b|\bmes\b/.test(hint) && !/\byears?\b|\banos?\b/.test(hint)) {
        return prefs(p).relevantMonths || "0";
      }
      if (/\byears?\b|\banos?\b|\bano\b/.test(hint) && !/\bmonths?\b|\bmeses?\b/.test(hint)) {
        return prefs(p).relevantYears;
      }
      const index = ctx.group.index;
      if (index === 0) return prefs(p).relevantYears;
      if (index === 1) return prefs(p).relevantMonths || "0";
      return "";
    },
    suggest: (p) => [
      { label: `${prefs(p).relevantYears || "0"} years`, value: prefs(p).relevantYears || "0" },
      { label: `${prefs(p).relevantMonths || "0"} months`, value: prefs(p).relevantMonths || "0" }
    ]
  });

  rule({
    id: "experience.totalYears",
    label: "Total years of experience",
    priority: 90,
    patterns: [/^(total\s+)?years?(\s+of\s+(professional\s+)?experience)?$/, /^years?$/, /^anos?$/],
    nameHints: ["years", "yearsofexperience", "total years"],
    mode: "choice",
    value: (p) => prefs(p).totalYears,
    suggest: (p) => [
      { label: `${prefs(p).totalYears || "0"} years`, value: prefs(p).totalYears || "0" }
    ]
  });

  rule({
    id: "experience.totalMonths",
    label: "Total months of experience",
    priority: 90,
    patterns: [/^(total\s+)?months?(\s+of\s+(professional\s+)?experience)?$/, /^months?$/, /^meses?$/],
    nameHints: ["months", "monthsofexperience", "total months"],
    mode: "choice",
    value: (p) => prefs(p).totalMonths || "0",
    suggest: (p) => [
      { label: `${prefs(p).totalMonths || "0"} months`, value: prefs(p).totalMonths || "0" }
    ]
  });

  rule({
    id: "skills.primary",
    label: "Primary skill",
    priority: 120,
    patterns: [/primary\s*skill/, /main\s*skill/, /primary\s*technical\s*skill/, /habilidade\s*principal/, /competencia\s*principal/],
    nameHints: ["primary skill", "primaryskill", "main skill"],
    mode: "tags",
    value: (p) => splitList(p.skills && p.skills.primary),
    suggest: (p) => skillSuggestions(p)
  });

  rule({
    id: "skills.secondary",
    label: "Secondary skills",
    priority: 120,
    patterns: [/secondary\s*skills?/, /other\s*skills?/, /additional\s*skills?/, /habilidades?\s*secundarias?/, /outras\s+habilidades/, /competencias?\s*adicionais/],
    nameHints: ["secondary skills", "secondaryskills", "other skills", "additional skills"],
    mode: "tags",
    value: (p) => splitList(p.skills && p.skills.secondary),
    suggest: (p) => skillSuggestions(p)
  });

  rule({
    id: "skills.list",
    label: "Skills",
    priority: 70,
    patterns: [/^skills$/, /^key\s*skills$/, /^technical\s*skills$/, /^habilidades$/, /^competencias$/],
    nameHints: ["skills", "skill list"],
    mode: "tags",
    value: (p) => allSkills(p),
    suggest: (p) => skillSuggestions(p)
  });

  /* ------------------------------------------------------------------ */
  /* Education                                                           */
  /* ------------------------------------------------------------------ */

  rule({
    id: "education.school",
    label: "School / university",
    priority: 100,
    patterns: [/school|university|college|institution/, /faculdade|universidade|instituicao/],
    nameHints: ["school", "university", "college", "institution"],
    value: (p) => {
      const item = Array.isArray(p.education) ? p.education[0] : null;
      return item ? item.school : "";
    },
    suggest: (p) =>
      (Array.isArray(p.education) ? p.education : [])
        .filter((item) => item.school)
        .map((item) => ({ label: item.school, value: item.school }))
  });

  rule({
    id: "education.degree",
    label: "Degree",
    priority: 100,
    patterns: [/^degree/, /education\s*level/, /highest\s*(degree|education)/, /^qualification$/, /^formacao/, /^escolaridade/],
    nameHints: ["degree", "education level", "qualification"],
    value: (p) => {
      const item = Array.isArray(p.education) ? p.education[0] : null;
      return item ? item.degree : "";
    },
    suggest: (p) =>
      (Array.isArray(p.education) ? p.education : [])
        .filter((item) => item.degree)
        .map((item) => ({ label: item.degree, value: item.degree }))
  });

  rule({
    id: "education.field",
    label: "Field of study",
    priority: 100,
    patterns: [/field\s*of\s*study/, /^major$/, /area\s*of\s*study/, /^course$/, /area\s+de\s+estudo/, /^curso$/],
    nameHints: ["field of study", "major", "area of study", "course"],
    value: (p) => {
      const item = Array.isArray(p.education) ? p.education[0] : null;
      return item ? item.field : "";
    },
    suggest: (p) =>
      (Array.isArray(p.education) ? p.education : [])
        .filter((item) => item.field)
        .map((item) => ({ label: item.field, value: item.field }))
  });

  /* ------------------------------------------------------------------ */
  /* Preferences                                                         */
  /* ------------------------------------------------------------------ */

  rule({
    id: "preferences.expectedSalary",
    label: "Expected compensation",
    priority: 120,
    patterns: [/expected.*(compensation|salary|pay|package)/, /salary\s*(expectation|requirement)/, /desired\s*(salary|compensation)/, /pretensao\s*salarial/],
    nameHints: ["expected salary", "salary", "compensation", "expected compensation"],
    exclude: [/currency/],
    value: (p) => prefs(p).expectedSalary,
    suggest: (p) => [
      { label: `Expected: ${prefs(p).expectedSalary || ""}`, value: prefs(p).expectedSalary },
      { label: "Negotiable", value: "Negotiable" }
    ]
  });

  rule({
    id: "preferences.currency",
    label: "Currency",
    priority: 135,
    patterns: [/^currency$/, /salary\s*currency/, /^currency\s*code$/, /^moeda$/],
    nameHints: ["currency", "currency code", "salary currency"],
    mode: "choice",
    value: (p) => prefs(p).currency,
    test: (ctx) => ctx.isSelect && /\b(usd|eur|brl|gbp|cad|aud)\b/.test(ctx.optionsText),
    testScore: 0.95,
    suggest: (p) => ["USD", "BRL", "EUR", "GBP", "CAD"].map((code) => ({ label: code, value: code }))
  });

  rule({
    id: "preferences.englishLevel",
    label: "English level",
    priority: 120,
    patterns: [/english\s*(level|proficiency)/, /level\s*of\s*english/, /english\s*fluency/, /nivel\s+de\s+ingles/],
    nameHints: ["english level", "englishlevel", "english proficiency"],
    mode: "choice",
    value: (p) => prefs(p).englishLevel,
    suggest: (p) => [
      { label: prefs(p).englishLevel || "Professional", value: prefs(p).englishLevel || "Professional" },
      { label: "Native or bilingual", value: "Native or bilingual proficiency" },
      { label: "Full professional", value: "Full professional proficiency" },
      { label: "Professional working", value: "Professional working proficiency" },
      { label: "Intermediate", value: "Intermediate" },
      { label: "Basic", value: "Basic" }
    ]
  });

  rule({
    id: "preferences.placeOfWork",
    label: "Preferred place of work",
    priority: 115,
    patterns: [/preferred\s*(place|location|work)\s*(of\s*work)?/, /work\s*(mode|arrangement|location\s*preference)/, /place\s*of\s*work/, /local\s+de\s+trabalho/, /modelo\s+de\s+trabalho/],
    nameHints: ["preferred place of work", "work mode", "workplace", "place of work"],
    mode: "choice",
    value: (p) => prefs(p).preferredPlaceOfWork,
    suggest: (p) => [
      { label: prefs(p).preferredPlaceOfWork || "Remote", value: prefs(p).preferredPlaceOfWork || "Remote" },
      { label: "Remote", value: "Remote" },
      { label: "Hybrid", value: "Hybrid" },
      { label: "On-site", value: "On-site" },
      { label: "Flexible", value: "Flexible" }
    ]
  });

  rule({
    id: "preferences.noticePeriod",
    label: "Notice period / availability",
    priority: 95,
    patterns: [/notice\s*period/, /when\s*can\s*you\s*start/, /availability\s*to\s*start/, /available\s*to\s*start/, /aviso\s+previo/, /disponibilidade/],
    nameHints: ["notice", "notice period", "availability", "start availability"],
    value: (p) => prefs(p).noticePeriod || prefs(p).availableStart,
    suggest: (p) => [
      { label: "Immediately", value: "Immediately" },
      { label: "2 weeks", value: "2 weeks" },
      { label: "30 days", value: "30 days" },
      { label: "60 days", value: "60 days" }
    ]
  });

  rule({
    id: "preferences.referral",
    label: "How did you hear about us",
    priority: 90,
    patterns: [/how\s+did\s+you\s+(hear|find|learn)/, /referral\s*source/, /where\s+did\s+you\s+(hear|find)/],
    nameHints: ["referral", "how did you hear", "source"],
    value: (p) => {
      const found = window.JAProfile.findCustomAnswer(p, ["how did you hear about us", "referral source", "source"]);
      return found ? found.value : "";
    },
    suggest: () => [
      { label: "LinkedIn", value: "LinkedIn" },
      { label: "Company website", value: "Company website" },
      { label: "Referral", value: "Referral" },
      { label: "Job board", value: "Job board" }
    ]
  });

  /* ------------------------------------------------------------------ */
  /* Eligibility and EEO                                                 */
  /* ------------------------------------------------------------------ */

  rule({
    id: "eligibility.sponsorship",
    label: "Visa sponsorship required",
    priority: 130,
    patterns: [/require.*sponsor/, /need.*sponsor/, /sponsor.*(required|needed)/, /visa\s*sponsorship/],
    nameHints: ["sponsorship", "requires sponsorship", "visa sponsorship"],
    mode: "boolean",
    value: (p) => boolValue(eligibility(p).requiresSponsorship),
    suggest: () => [
      { label: "No", value: "No" },
      { label: "Yes", value: "Yes" }
    ]
  });

  rule({
    id: "eligibility.workAuthorization",
    label: "Authorized to work",
    priority: 120,
    patterns: [/authori[sz]ed\s+to\s+work/, /legally\s+(authori[sz]ed|eligible)/, /right\s+to\s+work/, /work\s+permit/],
    nameHints: ["authorized", "work authorization", "workauthorization", "right to work", "work permit"],
    mode: "boolean",
    value: (p) => boolValue(eligibility(p).authorizedToWork),
    suggest: () => [
      { label: "Yes", value: "Yes" },
      { label: "No", value: "No" }
    ]
  });

  rule({
    id: "eligibility.gender",
    label: "Gender",
    priority: 90,
    patterns: [/^gender$/, /gender\s*identity/, /^genero$/],
    nameHints: ["gender", "gender identity"],
    mode: "choice",
    value: (p) => eligibility(p).gender,
    suggest: (p) => [
      { label: eligibility(p).gender || "Decline to self-identify", value: eligibility(p).gender || "Decline to self-identify" },
      { label: "Woman", value: "Woman" },
      { label: "Man", value: "Man" },
      { label: "Non-binary", value: "Non-binary" },
      { label: "Decline to self-identify", value: "Decline to self-identify" }
    ]
  });

  rule({
    id: "eligibility.ethnicity",
    label: "Race / ethnicity",
    priority: 90,
    patterns: [/\brace\b/, /ethnicity/, /^etnia$/],
    nameHints: ["race", "ethnicity", "race ethnicity"],
    mode: "choice",
    value: (p) => eligibility(p).ethnicity,
    suggest: (p) => [
      { label: eligibility(p).ethnicity || "Decline to self-identify", value: eligibility(p).ethnicity || "Decline to self-identify" },
      { label: "Asian", value: "Asian" },
      { label: "Black or African American", value: "Black or African American" },
      { label: "Hispanic or Latino", value: "Hispanic or Latino" },
      { label: "White", value: "White" },
      { label: "Decline to self-identify", value: "Decline to self-identify" }
    ]
  });

  rule({
    id: "eligibility.veteran",
    label: "Veteran status",
    priority: 90,
    patterns: [/veteran/, /veterano/],
    nameHints: ["veteran", "veteran status"],
    mode: "choice",
    value: (p) => eligibility(p).veteran,
    suggest: () => [
      { label: "I am not a protected veteran", value: "I am not a protected veteran" },
      { label: "I am a protected veteran", value: "I am a protected veteran" },
      { label: "Decline to self-identify", value: "Decline to self-identify" }
    ]
  });

  rule({
    id: "eligibility.disability",
    label: "Disability status",
    priority: 90,
    patterns: [/disabilit/, /deficiencia/],
    nameHints: ["disability", "disabilities"],
    mode: "choice",
    value: (p) => eligibility(p).disability,
    suggest: () => [
      { label: "No", value: "No" },
      { label: "Yes", value: "Yes" },
      { label: "Decline to self-identify", value: "Decline to self-identify" }
    ]
  });

  /* ------------------------------------------------------------------ */
  /* Matching                                                            */
  /* ------------------------------------------------------------------ */

  const MIN_SCORE = 0.6;

  const scoreRule = (ctx, item) => {
    if (item.when && !item.when(ctx)) return 0;
    // Never type Yes/No into a free-text box. Boolean answers only make sense
    // for checkboxes, radios and selects that actually offer Yes/No options;
    // otherwise a loose label match can write "Yes" into a city, name, etc.
    if (
      item.mode === "boolean" &&
      ctx.tagName === "INPUT" &&
      !ctx.isCheckbox &&
      !ctx.isRadio &&
      !/\byes\b/.test(ctx.optionsText || "")
    ) {
      return 0;
    }
    let best = 0;
    for (const candidate of ctx.labels) {
      const text = normalizeText(candidate.text);
      if (!text) continue;
      if (item.exclude.some((re) => re.test(text))) continue;
      for (const pattern of item.patterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(text);
        if (!match) continue;
        const atStart = match.index === 0;
        const coverage = Math.min(1, match[0].length / Math.max(text.length, 8));
        const score = candidate.weight * (atStart ? 1 : 0.92) * (0.9 + coverage * 0.1);
        if (score > best) best = score;
      }
    }

    if (ctx.autocomplete && item.autocomplete.length && item.autocomplete.includes(ctx.autocomplete)) {
      best = Math.max(best, 1.3);
    }

    if (item.nameHints.length && ctx.nameString) {
      const tokens = ctx.nameString.split(" ");
      if (item.nameHints.some((hint) => ctx.nameString === hint || tokens.includes(hint) || ctx.nameString.includes(hint))) {
        if (!item.exclude.some((re) => re.test(ctx.nameString))) {
          best = Math.max(best, 0.72);
        }
      }
    }

    if (item.test && item.test(ctx)) {
      best = Math.max(best, item.testScore || 0.9);
    }

    return best;
  };

  const RULES_BY_ID = new Map(RULES.map((item) => [item.id, item]));

  /* ------------------------------------------------------------------ */
  /* Locale coverage                                                     */
  /* ------------------------------------------------------------------ */
  // Portuguese puts the noun after interrogatives ("Qual é a sua
  // cidade?"), so the pt-BR patterns are unanchored and use \b. Extra
  // English variants that real ATS forms use are collected here too.
  // Keep this table declarative: it is the single place to add a locale.
  const LOCALE_PATTERNS = {
    "personal.pronouns": {
      patterns: [/\bpronomes?\b/, /\bpronomes?\s+preferidos?\b/],
      nameHints: ["pronomes"]
    },
    "personal.phoneCountryCode": {
      patterns: [/\bddi\b/, /\bcodigo\s+de\s+discagem\b/, /\bprefico\s+telefonico\b/],
      nameHints: ["ddi"]
    },
    "personal.phone": {
      patterns: [/\btelefone\b/, /\bcelular\b/, /\bfone\b/],
      nameHints: ["telefone", "celular", "fone"]
    },
    "personal.firstName": {
      patterns: [
        /^primeiro\s+nome\b/,
        /\bseu\s+nome\b(?!\s+completo)/,
        /\bqual\s+(e\s+)?(o\s+)?seu\s+nome\b(?!\s+completo)/,
        /^nome\b(?!\s*(completo|do\s+meio|social|da\s+empresa|do\s+arquivo|de\s+usuario|do\s+usuario|do\s+responsavel|do\s+contato|do\s+recrutador|fantasia))/
      ],
      nameHints: ["primeiro nome", "nome"]
    },
    "personal.middleName": {
      patterns: [/^nome\s+do\s+meio\b/, /^nome\s+intermediario\b/],
      nameHints: ["nome do meio"]
    },
    "personal.preferredName": {
      patterns: [/^nome\s+social\b/, /^nome\s+preferido\b/, /^apelido\b/],
      nameHints: ["nome social", "nome preferido", "apelido"]
    },
    "personal.lastName": {
      patterns: [/^sobrenome\b/, /^ultimo\s+nome\b/],
      nameHints: ["sobrenome"]
    },
    "personal.fullName": {
      patterns: [/\bnome\s+completo\b/, /^nome\s+e\s+sobrenome\b/],
      nameHints: ["nome completo"],
      exclude: [/arquivo/, /responsavel/, /usuario/, /recrutador/, /recruiter/]
    },
    "personal.website": {
      patterns: [/\bportifolio\b/, /\bsite\s+pessoal\b/, /\bsite\s+profissional\b/],
      nameHints: ["portifolio", "site pessoal"],
      exclude: [/empresa/, /company/]
    },
    "personal.country": {
      patterns: [/\bpais\s+de\s+residencia\b/, /\bpais\s+onde\s+(reside|mora)\b/],
      nameHints: ["pais"],
      exclude: [/empresa/, /company/]
    },
    "personal.birthCountry": {
      patterns: [/\bpais\s+(de\s+)?(nascimento|origem|natal)\b/, /\bnaturalidade\b/],
      nameHints: ["pais de nascimento", "naturalidade"]
    },
    "personal.city": {
      patterns: [
        /^cidade\b/,
        /\bcidade\s+(atual|de\s+residencia|onde\s+(mora|reside))\b/,
        /\bqual\s+(e\s+)?(a\s+)?sua\s+(cidade|localizacao)\b/,
        /\blocalizacao\s+atual\b/,
        /\bcity\s+of\s+residence\b/
      ],
      nameHints: ["cidade", "localizacao"],
      exclude: [/empresa/, /company/, /\bvaga\b/, /\bjob\b/, /escritorio/, /office/]
    },
    "personal.state": {
      patterns: [/^estado\b/, /\bunidade\s+federativa\b/, /^uf$/],
      nameHints: ["estado", "uf"],
      exclude: [/civil/, /marital/]
    },
    "personal.address": {
      patterns: [/^endereco\b/, /\blogradouro\b/, /^rua\b/, /\bbairro\b/],
      nameHints: ["endereco", "logradouro", "rua", "bairro"],
      exclude: [/e-?mail/, /linkedin/, /github/, /twitter/, /\bsite\b/, /website/, /arquivo/]
    },
    "personal.postalCode": {
      patterns: [/\bcep\b/, /\bcodigo\s+postal\b/],
      nameHints: ["cep"]
    },
    "personal.nationality": {
      patterns: [/\bnacionalidade\b/, /\bcidadania\b/],
      nameHints: ["nacionalidade"]
    },
    "current.company": {
      patterns: [
        /^empresa\b/,
        /^nome\s+da\s+empresa\b/,
        /\bempresa\s+atual\b/,
        /^empregador\b/,
        /^companhia\b/,
        /\brazao\s+social\b/,
        /\bnome\s+fantasia\b/,
        /^current\s+(company|employer)$/,
        /current\s+or\s+most\s+recent\s+(company|employer)/
      ],
      nameHints: ["empresa", "empregador", "nome da empresa"],
      exclude: [/may\s+we\s+contact/, /contact\s+your/, /\blocal\b/, /\bsite\b/]
    },
    "current.title": {
      patterns: [/^cargo(\s+atual)?\b/, /^funcao(\s+atual)?\b/, /\btitulo\s+do\s+cargo\b/, /current\s+or\s+most\s+recent\s+(job\s+)?title/],
      nameHints: ["cargo", "funcao"]
    },
    "current.roleCategory": {
      patterns: [/\bfamilia\s+de\s+cargos\b/, /\barea\s+de\s+interesse\b/]
    },
    "current.location": {
      patterns: [/\blocal\s+da\s+empresa\b/, /\blocalizacao\s+da\s+empresa\b/],
      exclude: [/preferencia/, /modelo/, /regime/, /remoto/, /hibrido/, /presencial/]
    },
    "current.remote": {
      patterns: [/\bhome\s*office\b/, /\bteletrabalho\b/]
    },
    "current.startDate": {
      patterns: [/\bdata\s+de\s+(admissao|entrada)\b/, /^inicio\s+em\b/, /^inicio$/, /^mes\s+de\s+inicio$/, /^ano\s+de\s+inicio$/],
      nameHints: ["data de admissao", "data de inicio"]
    },
    "current.endDate": {
      patterns: [/\bdata\s+de\s+(saida|demissao|encerramento)\b/, /^(fim|termino)$/, /^(mes|ano)\s+de\s+(fim|termino)$/],
      nameHints: ["data de saida", "data de demissao"]
    },
    "current.current": {
      patterns: [/\bainda\s+trabalho\s+(aqui|nesta\s+empresa)\b/, /\batualmente\s+(trabalho|empregado)\b/],
      exclude: [/cargo/, /funcao/]
    },
    "current.description": {
      patterns: [
        /\bdescricao\s+(das\s+)?atividades\b/,
        /\bresumo\s+(da\s+)?(funcao|experiencia)\b/,
        /\bprincipais\s+atividades\b/,
        /\batividades\s+exercidas\b/,
        /\batribuicoes\b/
      ],
      nameHints: ["descricao das atividades"]
    },
    "current.skills": {
      patterns: [/\bcompetencias?\s+(usadas|utilizadas)\b/, /\btecnologias\s+(usadas|utilizadas)\b/]
    },
    "experience.totalPair": {
      patterns: [/\btempo\s+total\s+de\s+experiencia\b/, /\bexperiencia\s+profissional\s+total\b/]
    },
    "experience.relevantPair": {
      patterns: [/\bexperiencia\s+com\s+(a\s+)?(habilidade|competencia)\s+principal\b/]
    },
    "experience.totalYears": {
      patterns: [/\bquantos\s+anos\b/, /\banos?\s+de\s+experiencia\b/, /how\s+many\s+years/]
    },
    "experience.totalMonths": {
      patterns: [/\bquantos\s+meses\b/, /\bmeses?\s+de\s+experiencia\b/, /how\s+many\s+months/]
    },
    "skills.primary": {
      patterns: [/habilidades?\s+principais?/, /\bcompetencia\s+principal\b/]
    },
    "education.school": {
      patterns: [/\binstituicao\s+de\s+ensino\b/, /\bnome\s+da\s+(faculdade|universidade|instituicao)\b/]
    },
    "education.degree": {
      patterns: [/\bgrau\s+de\s+instrucao\b/, /\bnivel\s+de\s+escolaridade\b/, /\bformacao\s+academica\b/],
      nameHints: ["escolaridade", "grau de instrucao"]
    },
    "education.field": {
      patterns: [/\barea\s+de\s+(estudo|formacao)\b/, /^curso$/, /\bqual\s+(foi\s+)?(o\s+)?seu\s+curso\b/]
    },
    "preferences.expectedSalary": {
      patterns: [/\bexpectativa\s+salarial\b/, /\bsalario\s+(pretendido|desejado)\b/, /\bpretensao\s+de\s+salario\b/, /\bfaixa\s+(de\s+)?salarial\b/, /\bremuneracao\s+(pretendida|desejada)\b/],
      nameHints: ["pretensao salarial", "expectativa salarial"]
    },
    "preferences.currency": {
      patterns: [/^moeda$/, /\bmoeda\s+do\s+salario\b/]
    },
    "preferences.englishLevel": {
      patterns: [/\bnivel\s+(de\s+)?ingles\b/, /\bfluencia\s+(em\s+)?ingles\b/],
      nameHints: ["nivel de ingles"]
    },
    "preferences.placeOfWork": {
      patterns: [/\bmodalidade\s+de\s+trabalho\b/, /\bregime\s+de\s+trabalho\b/, /\btipo\s+de\s+trabalho\b/],
      nameHints: ["modelo de trabalho", "regime de trabalho", "modalidade de trabalho"]
    },
    "preferences.noticePeriod": {
      patterns: [/\bquando\s+(voce\s+)?pode\s+(comecar|iniciar)\b/, /\bdata\s+de\s+disponibilidade\b/],
      exclude: [/viag/, /horario/, /turno/, /fim\s+de\s+semana/, /travel/, /schedule/, /shift/, /presencial/, /remoto/, /hibrido/, /modelo/, /regime/, /mudanca/, /relocat/]
    },
    "preferences.referral": {
      patterns: [
        /\bcomo\s+(voce\s+)?(soube|conheceu|encontrou)\b/,
        /\bonde\s+(voce\s+)?(viu|encontrou)\b/,
        /\bindicacao\b/,
        /\bfonte\s+da\s+candidatura\b/
      ],
      nameHints: ["indicacao", "como soube"]
    },
    "eligibility.sponsorship": {
      patterns: [/\bpatrocinio\s+(de\s+)?visto\b/, /\b(necessita|precisa)\s+(de\s+)?patrocinio\b/, /\bsponsor\s+de\s+visto\b/],
      nameHints: ["patrocinio de visto"]
    },
    "eligibility.workAuthorization": {
      patterns: [
        /\bautoriza(do|da|cao)\s+(para\s+|a\s+)?trabalhar\b/,
        /\bautorizacao\s+(de\s+)?trabalho\b/,
        /\bpermissao\s+(de\s+|para\s+)?trabalho\b/,
        /\bvisto\s+de\s+trabalho\b/,
        /\belegivel\s+para\s+trabalhar\b/,
        /\bdireito\s+de\s+trabalhar\b/
      ],
      nameHints: ["autorizado a trabalhar", "permissao de trabalho"]
    },
    "eligibility.gender": {
      patterns: [/^genero$/, /\bidentidade\s+de\s+genero\b/]
    },
    "eligibility.ethnicity": {
      patterns: [/\braca\s*\/?\s*cor\b/, /cor\s*\/?\s*raca/, /\braca\b/, /\betnia\b/]
    },
    "eligibility.disability": {
      patterns: [/\bpcd\b/, /\bpessoa\s+com\s+deficiencia\b/]
    },
    "personal.linkedin": {
      exclude: [/empresa/, /company/]
    },
    "personal.github": {
      exclude: [/empresa/, /company/]
    }
  };

  for (const [id, extra] of Object.entries(LOCALE_PATTERNS)) {
    const item = RULES_BY_ID.get(id);
    if (!item) continue;
    if (extra.patterns) item.patterns.push(...extra.patterns);
    if (extra.nameHints) item.nameHints.push(...extra.nameHints);
    if (extra.exclude) item.exclude.push(...extra.exclude);
  }


  const match = (ctx, profile) => {
    let best = null;
    for (const item of RULES) {
      const score = scoreRule(ctx, item);
      if (score < MIN_SCORE) continue;
      if (!best || score > best.score + 0.0001 || (Math.abs(score - best.score) <= 0.0001 && item.priority > best.rule.priority)) {
        best = { rule: item, score };
      }
    }
    if (!best) return null;
    let value = "";
    try {
      value = best.rule.value(profile, ctx);
    } catch (error) {
      console.warn("[Job Autofill] Rule failed", best.rule.id, error);
    }
    if (Array.isArray(value)) value = value.filter(Boolean);
    const empty = Array.isArray(value) ? value.length === 0 : value === "" || value == null;
    return {
      rule: best.rule,
      score: best.score,
      value: empty ? "" : value,
      label: best.rule.label,
      mode: best.rule.mode
    };
  };

  const suggestions = (matchedRule, profile, ctx) => {
    if (!matchedRule) return [];
    let items = [];
    if (typeof matchedRule.suggest === "function") {
      try {
        items = matchedRule.suggest(profile, ctx) || [];
      } catch (_) {
        items = [];
      }
    }
    if (!items.length && matchedRule.groups.length) {
      const groups = new Set(matchedRule.groups);
      items = window.JAProfile.catalog(profile)
        .filter((entry) => groups.has(entry.group))
        .map((entry) => ({ label: `${entry.label}: ${entry.value}`, value: entry.value, group: entry.group }));
    }
    const seen = new Set();
    return items
      .filter((item) => item && String(item.value || "").trim())
      .filter((item) => {
        const key = `${item.label}|${item.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 60);
  };

  const byId = (id) => RULES_BY_ID.get(id) || null;

  window.JARules = {
    RULES,
    MIN_SCORE,
    match,
    suggestions,
    byId,
    scoreRule,
    allSkills
  };
})();
