# Job Form Autofill (Firefox)

A Firefox extension that fills job-application forms from **one career profile**. It matches fields by
their visible label (and `aria-*`, `name`, `id`, placeholder and nearby text), so it works across
different job boards without a separate integration for each site.

If a question is not in your profile, the popup and the in-page picker let you choose a saved value with
the mouse or type a new one — and optionally remember that answer for next time.

![Manifest V3](https://img.shields.io/badge/Firefox-115%2B-blue) ![No network](https://img.shields.io/badge/network-none-success) ![Data](https://img.shields.io/badge/data-browser--local-informational)

---

## What it fills

Built from real application screens such as Mercor-style forms:

| Area | Examples |
| --- | --- |
| Contact | First/last name, full name, preferred name, pronouns, email, phone + country code, country, city, state, address, postal code, birth date, nationality, CPF and RG (Brazil) |
| Links | LinkedIn, GitHub, portfolio/website, X (Twitter) |
| Current role | Most recent employer, job title, role category, company location, employment type, start date, end date, remote, description, skills used |
| Experience | Total professional experience (years + months), relevant experience in the primary skill; repeated work-history editors are filled block by block from the experience list |
| Skills | Primary skill, secondary skills, generic skill chips (deduplicated against existing chips) |
| Education | School/university, degree, field of study |
| Preferences | Expected compensation, currency, English level, preferred place of work, notice period/availability |
| Eligibility | Work authorization, visa sponsorship |
| EEO | Gender, race/ethnicity, veteran, disability (including “decline to self-identify”) |
| Custom | Any labelled question you save an answer for |

It supports text inputs, textareas, native selects, checkbox/radio groups, custom `role="combobox"`
dropdowns, chip/tag inputs, native date/month inputs and rich-text editors (contenteditable).

---

## Install (temporary, development)

> A prebuilt archive is available at `dist/job_form_autofill-1.2.0.zip`. Use the folder below (not the zip)
> with `about:debugging`; the zip is for signing/distribution.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `job-autofill/manifest.json`.
4. The career profile opens automatically on first install. Fill it and click **Save** (it also autosaves).
5. Open a job application and use the toolbar button or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>.

Temporary add-ons disappear when Firefox closes. For a persistent install you need to sign the package
(see [Build & sign](#build--sign)).

## Quick start with the included profile

The profile in `samples/profile.example.json` uses fictitious demo data. In the options page, open
**Import & export → Load example profile**. Replace the values with your own before using it.

> The example profile is included in the extension package and is only stored locally when you import
> it. All names, contacts, employers and schools in it are fictitious.

---

## Using it

### 1. Auto-fill

When a page or an application step loads, the extension fills empty fields automatically. It waits until
at least two questions match the profile and the page looks job-related (URL/title/referrer or 4+ matched
fields). Multi-step applications are watched for DOM changes, so each new step is filled as it appears.

Auto-fill never overwrites something that is already on the page, and it does not touch fields you have
typed into. Toggle it globally or per site:

- Options → **Settings → Auto-fill**.
- Options → **Settings → Use a fake CPF** to fill CPF fields with a generated, valid-format CPF
  instead of your saved number. The CPF field also has a **Fake CPF** toggle in the popup.
- Options → **Settings → Use a fake RG** to fill RG fields with a generated, valid-format RG
  instead of your saved number. The RG field also has a **Fake RG** toggle in the popup.
- Popup footer → **Auto-fill on this site**.

### 2. Popup

Click the toolbar icon to see every detected field, what the extension will fill, and what needs
attention. From there you can:

- **Fill empty fields** – only fill blanks.
- **Overwrite all** – replace wrong values already on the page.
- **Pick on page** – close the popup and use the in-page picker.
- **Choose value** – open a searchable list of all saved values (including descriptions, previous
  employers and custom answers), or type a value.
- **Save as answer for this field** – remember typed values for questions that are not built in.
- **Undo fill** – restore the values from before the last fill.
- **Auto-fill on this site** – adds/removes the hostname from the disabled-sites list.

### 3. Mouse-only picker

**Alt+Shift+P**, the context menu, the popup, or the optional floating ⚡ button opens an in-page panel:

1. Click any field on the page.
2. Choose one of the suggested values with the mouse, or type a value and press **Fill**.
3. Optionally check **Save as answer for this field**.

The panel lives in a shadow root, so the site’s CSS cannot break it.

### 4. Context menu and shortcuts

- <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> — fill the current page.
- <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> — open the picker.
- Right-click → **Fill this page** / **Pick a field** / **Edit career profile…**.
- Change shortcuts at `about:addons` → ⚙ → **Manage Extension Shortcuts**.

### 5. Saved answers

Questions that are not built in (for example “Why do you want to work here?”) can be saved as
key/value pairs under **Saved answers**. The key is matched against the field label; keep it close to the
question text, e.g. `why do you want to work here`, `notice period`, `greatest strength`.

When a rule already exists, the rule wins. Saved answers are the fallback, and the popup can add them
for you with the remember checkbox.

---

## How the matching works

For every visible control the extension builds a labelled **field context** from:

| Source | Weight |
| --- | --- |
| `aria-labelledby` / `aria-label` | 0.98 – 1.00 |
| `<label for>` / wrapping `<label>` | 0.93 – 0.97 |
| Question label in the field wrapper (Vuetify/Material, no `for`) | 0.90 |
| Radio/checkbox group question above the options | 0.92 |
| Text directly before the control | 0.82 |
| Text directly after the control (labels below the input) | 0.88 |
| `placeholder` | 0.78 |
| Fieldset `<legend>` / `role="radiogroup"` label | 0.80 – 0.92 |
| Row text / nearest heading | 0.55 – 0.62 |
| `name`, `id`, `autocomplete`, `data-testid` tokens | token match |

Text is normalized (lowercase, accents stripped, punctuation and `*` removed). Each rule in
`content/rules.js` has regex patterns, optional exclusions, a priority and a value getter. The best
scoring rule above `0.6` wins; exact `autocomplete` values (`given-name`, `email`, `tel`, …) score
very high. Neighbouring field groups are deliberately **not** used as labels, which prevents a
“Job Title at recent employer” field from being read as a company field.

Rules also decide how to write the value:

- **Tags** — adds each skill to a chip input, clicking an existing “+ Java” suggestion when present,
  and skipping values that are already chips.
- **Choice** — matches “Yes/No”, “Remote/Hybrid/On-site”, “Decline to self-identify” and similar
  synonyms, including Portuguese options (“Sim/Não”, “Remoto”, “Avançado”).
- **Date** — native date/month inputs receive ISO values; text date inputs use the format hint in the
  placeholder or `Settings → Date format` (default `MM/DD/YYYY`).
- **Rich text** — uses `execCommand`, a synthetic paste, or a safe HTML fallback for editors such as
  TipTap/ProseMirror.
- **Checkboxes/radios** — handles negative labels (“I do not require sponsorship”) correctly.

Values are written through the native prototype setter and dispatched as `input`/`change` events, which
makes React, Vue and Angular forms notice the update.

### Adding a rule

No build step required. Add a rule to `content/rules.js`:

```js
rule({
  id: "personal.portfolio",
  label: "Portfolio URL",
  priority: 100,
  patterns: [/\bportfolio\b/],
  value: (p) => p.personal.website
});
```

Then reload the extension. Supported `mode`s: `text` (default), `tags`, `choice`, `boolean`,
`richtext`, `date`. Use `exclude` patterns to avoid false positives and `nameHints`/`autocomplete`
for technical identifiers.

### Repeated blocks (work history)

Some forms render the same block several times (“Nome da Empresa”, “Cargo”, “Data de início”,
“Data de saída”, “Relação de Emprego”, “Principais Atividades Exercidas”). The extension numbers the
repetitions and fills them in order:

- a section titled **“Empregos Anteriores” / “Previous jobs”** starts at the first previous role
  (`experience[0]`), skipping the current one;
- a generic **“Experiência Profissional” / “Work experience”** starts with the current role, then the
  previous roles;
- a form with a single company/title/date still uses the current role, as before.

“Relação de Emprego” / “Employment type” comes from the new `employmentType` field on the current role
and on each experience entry (CLT, PJ, Estágio, Aprendiz, Freelancer…), editable in **Options →
Current role / Experience history**.

### Languages (English + Brazilian Portuguese)

Labels are matched in **English and pt-BR** out of the box. The language-specific patterns live in
`LOCALE_PATTERNS` near the end of `content/rules.js` (before `match`), so a new locale is one table
entry per rule instead of edits scattered through the file:

```js
"personal.city": {
  patterns: [/\bcidade\b/, /\bqual\s+(e\s+)?(a\s+)?sua\s+cidade\b/],
  nameHints: ["cidade"],
  exclude: [/empresa/, /company/]
}
```

Portuguese option text (“Sim/Não”, “Remoto/Híbrido/Presencial”, “Avançado”, “Prefiro não informar”,
“Não sou veterano”, …) is handled by `CHOICE_SYNONYMS` in `content/filler.js`. Add an alias list there
when a form uses a new wording for an option. Hyphenated labels (“Pós-graduação”, “Não-binário”) are
matched with or without the hyphen, and `dd/mm/aaaa` date placeholders are detected and filled as
DD/MM/YYYY automatically.

All patterns run on accent-stripped, lowercased text, so `Endereço`, `endereco` and `ENDEREÇO` are the
same. Keep pt-BR patterns unanchored: Portuguese puts the noun after the question word
(“Qual é a sua cidade?”).

### Tests

```bash
node tests/i18n.test.js
node tests/labels.test.js
```

The first test loads `shared/profile.js`, `content/labels.js`, `content/rules.js` and `content/filler.js` in
a Node `vm` (no dependencies) and checks English and pt-BR labels, common false positives
(“Estado civil”, “País da empresa”, “May we contact your current employer?”) and Portuguese option
picking. Add a case there whenever you add a rule or an alias.

The second test builds a tiny fake DOM shaped like Vuetify/Material forms (question in a `<label>`
without `for`, dangling `aria-labelledby`, readonly textarea sizer, radio group question above the
options) and asserts that label discovery and rule matching still find the question. Add a shape there
when a site breaks label discovery.

---

## Demo form

The `demo/` folder reproduces the layout from the screenshots (labels below inputs, custom dropdowns,
chip inputs, rich-text description, work-experience editor).

Content scripts cannot run on `moz-extension://` pages, so serve it over HTTP:

```bash
cd job-autofill
python3 -m http.server 8000 --bind 127.0.0.1
# open http://localhost:8000/demo/form.html
# repeated work-history blocks (pt-BR):
# open http://localhost:8000/demo/form-experience-ptbr.html
```

Alternative: open `demo/form.html` directly and enable **Access file URLs** for the extension in
`about:addons` → Permissions. Then it works over `file://`.

Use the demo to test matching, the picker, chip fields and the description editor. It never sends
anything anywhere.

---

## Privacy & permissions

- The profile is stored with `browser.storage.local`; there is **no network code**, no analytics and no
  remote sync.
- `host_permissions: <all_urls>` is required because job applications live on arbitrary domains. Content
  scripts read form labels/values only to fill them; there is no telemetry.
- `scripting` lets the popup inject the content script into tabs that were already open when the
  extension was installed or reloaded.
- `contextMenus` powers the right-click actions; `storage` holds the profile.
- The manifest declares `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]`,
  which is accurate: nothing is transmitted off the device.
- Auto-fill can be disabled globally or per site. File uploads are never touched; the extension never
  submits an application.

Review everything on the page before submitting. The extension is an assistant, not an auto-applier.

---

## Known limitations

- **File inputs** (`Resume/CV`) cannot be set programmatically by a WebExtension. Attach them manually.
- **Canvas-based or highly custom widgets** (some Workday/Lever variants) may not expose a real
  `<input>`, or may render options outside the document. If a field does not fill, use the picker or
  type it manually.
- **Custom date pickers** that are not native inputs cannot be reliably driven; fill them manually.
- **Fake CPF** values are generated from your profile for privacy/testing. They pass the CPF checksum
  but are not official documents; a site that cross-checks public records may reject them.
- **Fake RG** values are generated from your profile for privacy/testing too. They use the São Paulo
  check-digit format, but RG rules vary by state and they are not official documents.
- Fields inside **shadow DOM / closed web components** are not discovered by `document.querySelectorAll`; use the page normally.
- Tabs that were already open before you installed or reloaded the extension need one page reload. The popup can inject on demand, but a reload is the most reliable.
- The popup shows the **top document**; auto-fill still runs in iframes (`all_frames: true`), but per-field picking does not reach inside an iframe.
- Chip/tag fields are capped at **10 new values per fill** to avoid runaway widgets. Click Fill again for more (existing chips are skipped).
- Popup scanning is top-frame oriented. Auto-fill runs in iframes too (`all_frames: true`), but the
  popup’s manual fallback may show only the top frame on iframe-based ATS pages.
- Some sites clear values with their own form state. Auto-fill retries a value at most twice, then stops
  to avoid fighting the page.
- Cover letters are not generated. Use a saved answer if you have a reusable text, or paste it.
- The example profile uses fictitious data — replace it with your own details before relying on it.

---

## Build & sign

Requirements: Node.js 18+ and Firefox 115+.

```bash
cd job-autofill

# Validate the manifest and package
npx web-ext lint --source-dir .

# Package only the runtime files (no demo/, samples/, tests/, README)
rm -rf /tmp/jfa-stage && mkdir -p /tmp/jfa-stage
cp -a manifest.json background.js LICENSE content icons options popup shared /tmp/jfa-stage/
npx web-ext build --source-dir /tmp/jfa-stage --artifacts-dir dist --overwrite-dest

# Run in a temporary Firefox profile
npx web-ext run --source-dir .
```

To distribute a persistent `.xpi`, sign it on addons.mozilla.org or with `web-ext sign`:

```bash
npx web-ext sign --source-dir /tmp/jfa-stage --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```

The add-on ID is `job-form-autofill@doykarin.com` (set in `manifest.json`). It is permanent once the
add-on is published, so change it before the first submission if you want a different one. Bump
`version` in `manifest.json` (and the footer in `options/options.html`) for every upload.

`web-ext lint` reports two informational `KEY_FIREFOX_*_UNSUPPORTED_BY_MIN_VERSION` warnings: the
`data_collection_permissions` key was introduced in Firefox 140 (142 on Android) while the manifest
supports Firefox 115+. Older versions simply ignore the key; AMO still reads it during review.

---

## Project structure

```
job-autofill/
├── manifest.json           # MV3, Firefox-specific settings, content scripts, commands
├── background.js           # install/context menu/shortcuts, on-demand injection
├── shared/
│   └── profile.js          # profile schema, storage, catalog, dates, custom answers
├── content/
│   ├── labels.js           # label extraction, visibility, field context
│   ├── rules.js            # matching rules + scoring
│   ├── filler.js           # writing values, tags, dropdowns, dates, auto-fill, undo
│   ├── picker.js           # in-page shadow-DOM value picker
│   └── content.js          # messaging + profile sync
├── popup/                  # toolbar UI (scan, fill, choose value, per-site toggle)
├── options/                # career profile editor (autosave, import/export)
├── samples/                # fictitious example profile
├── tests/                  # dependency-free English + pt-BR matching tests
├── demo/                   # reproducible test form + tiny static server
└── icons/
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Popup says “Can't read this page” | Click **Reload tab** (or **Try again** after installing/reloading the extension). Firefox blocks extensions on `about:` pages, `addons.mozilla.org` and PDF viewers. Expand **Technical details** if the problem persists. |
| Demo form does nothing | It is probably open at a `moz-extension://` URL. Run `bash demo/serve.sh` and use `http://localhost:8000/demo/form.html`. |
| Nothing fills automatically | Check **Settings → Auto-fill**, the per-site toggle, and that the profile is not empty. Some pages need a click on **Fill empty fields**. |
| A dropdown does not fill | Many ATS dropdowns are custom widgets. Use the picker; if the widget only supports keyboard/mouse, select it manually. |
| A date is off by one day | Change **Settings → Date format** to match the site (`DD/MM/YYYY` vs `MM/DD/YYYY`). Native date inputs always receive ISO. |
| Values revert after filling | The site’s framework rejected the synthetic change. Try clicking the field once, then **Fill empty fields**; for exotic widgets use the picker. |
| File URL demo is blocked | `about:addons` → Job Form Autofill → Permissions → enable **Access your data for file:// URLs**. |

---

## License

MIT — see `LICENSE`.
