/**
 * Label-discovery regression tests.
 *
 * Run with: node tests/labels.test.js
 *
 * Some component libraries (Vuetify/Material, for example) render the
 * question as a plain <label> with no `for`, in a wrapper that also holds
 * the control, and point aria-labelledby at an id that is never rendered.
 * These tests build that exact DOM shape with a tiny dependency-free stub
 * so label discovery keeps working even though the extension only sees the
 * rendered page.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

/* ------------------------------------------------------------------ */
/* Tiny DOM stub (only what content/labels.js touches)                 */
/* ------------------------------------------------------------------ */

class TextNode {
  constructor(value, parent) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.parentElement = parent;
  }
  get textContent() {
    return this.nodeValue;
  }
}

const splitSelectors = (selector) =>
  String(selector)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const matchesSimple = (el, selector) => {
  const sel = selector.trim();
  const tagMatch = /^([a-zA-Z][\w-]*)/.exec(sel);
  const tag = tagMatch ? tagMatch[1] : null;
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;

  for (const not of sel.matchAll(/:not\(([^)]*)\)/g)) {
    if (matchesSimple(el, not[1])) return false;
  }

  for (const attr of sel.matchAll(/\[([a-zA-Z-]+)(?:=(["']?)(.*?)\2)?\]/g)) {
    const actual = el.getAttribute(attr[1]);
    if (actual === null) return false;
    if (attr[3] !== undefined && actual !== attr[3]) return false;
  }
  return true;
};

const matches = (el, selector) => splitSelectors(selector).some((part) => matchesSimple(el, part));

class El {
  constructor(tag, attrs = {}, children = []) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attrs = {};
    for (const [key, value] of Object.entries(attrs)) this.attrs[key] = String(value);
    this.childNodes = [];
    this.parentElement = null;
    this.isConnected = true;
    this.disabled = false;
    this.readOnly = false;
    this.hidden = false;
    this.required = false;
    this.isContentEditable = false;
    this.value = "";
    this.offsetParent = {};
    for (const child of children) this.append(child);
  }

  append(child) {
    const node = typeof child === "string" ? new TextNode(child, this) : child;
    node.parentElement = this;
    this.childNodes.push(node);
    return node;
  }

  get id() {
    return this.attrs.id || "";
  }

  get htmlFor() {
    return this.attrs.for || "";
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }

  get options() {
    return this.children.filter((child) => child.tagName === "OPTION");
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent || "").join("");
  }

  get previousElementSibling() {
    if (!this.parentElement) return null;
    const siblings = this.parentElement.children;
    return siblings[siblings.indexOf(this) - 1] || null;
  }

  get nextElementSibling() {
    if (!this.parentElement) return null;
    const siblings = this.parentElement.children;
    return siblings[siblings.indexOf(this) + 1] || null;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  matches(selector) {
    return matches(this, selector);
  }

  closest(selector) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  contains(node) {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matches(child, selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getBoundingClientRect() {
    return { width: 10, height: 10 };
  }

  getClientRects() {
    return [{}];
  }
}

/* ------------------------------------------------------------------ */
/* Quickin/Vuetify-shaped form                                         */
/* ------------------------------------------------------------------ */

const html = new El("html");
const body = html.append(new El("body"));
const form = body.append(new El("form"));

const field = (question, attrs) => {
  const box = form.append(new El("div", { class: "mb-4" }));
  const inner = box.append(new El("div"));
  inner.append(new El("div", { class: "mb-0" })).append(new El("label", {}, [question]));
  const vinput = inner.append(new El("div", { class: "v-input" }));
  const control = vinput.append(new El("div", { class: "v-input__control" }));
  const vfield = control.append(new El("div", { class: "v-field" }));
  const fieldBody = vfield.append(new El("div", { class: "v-field__field" }));
  return fieldBody.append(new El("input", attrs));
};

const fullName = field("Nome completo *", {
  id: "input-v-0-12",
  type: "text",
  "aria-labelledby": "input-v-0-12-label"
});
const email = field("E-mail *", {
  id: "input-v-0-15",
  type: "email",
  "aria-labelledby": "input-v-0-15-label"
});

// Textarea with the readonly "sizer" that Vuetify renders next to it.
const summaryBox = form.append(new El("div", { class: "mb-4" }));
const summaryInner = summaryBox.append(new El("div"));
summaryInner.append(new El("div", { class: "mb-0" })).append(new El("label", {}, ["Resumo das qualificações *"]));
const summaryInput = summaryInner.append(new El("div", { class: "v-input v-textarea" }));
const summaryControl = summaryInput.append(new El("div", { class: "v-input__control" }));
const summaryField = summaryControl.append(new El("div", { class: "v-field" }));
const summaryBody = summaryField.append(new El("div", { class: "v-field__field" }));
const summary = summaryBody.append(new El("textarea", { id: "input-v-0-25" }));
const sizer = summaryBody.append(new El("textarea", { id: "input-v-0-25-sizer", readonly: "", "aria-hidden": "true" }));
sizer.readOnly = true;

// Radio group: question above the group, each option labelled with `for`.
const genderBox = form.append(new El("div", { class: "mb-4" }));
const genderInner = genderBox.append(new El("div"));
genderInner.append(new El("div", { class: "mb-0" })).append(new El("label", {}, ["Gênero *"]));
const genderInput = genderInner.append(new El("div", { class: "v-input v-radio-group" }));
const genderControl = genderInput.append(new El("div", { class: "v-input__control" }));
const genderGroup = genderControl.append(new El("div", { class: "v-selection-control-group", role: "radiogroup" }));
const radios = [];
for (const [id, option] of [
  ["input-v-0-46", "Masculino"],
  ["input-v-0-47", "Feminino"],
  ["input-v-0-49", "Prefiro não dizer"]
]) {
  const controlWrap = genderGroup.append(new El("div", { class: "v-selection-control" }));
  const wrapper = controlWrap.append(new El("div", { class: "v-selection-control__wrapper" }));
  const inputWrap = wrapper.append(new El("div", { class: "v-selection-control__input" }));
  const radio = inputWrap.append(
    new El("input", { id, type: "radio", name: "gender", "aria-label": option })
  );
  wrapper.append(new El("label", { for: id }, [option]));
  radios.push(radio);
}

const document = {
  getElementById(id) {
    return html.querySelectorAll(`[id="${id}"]`)[0] || null;
  },
  querySelector(selector) {
    return html.querySelector(selector);
  },
  querySelectorAll(selector) {
    return html.querySelectorAll(selector);
  }
};

// Native select whose question is a <label for> containing a nested <div>
// (LinkedIn Easy Apply renders exactly this shape).
const countryBox = form.append(new El("div", { class: "mb-4" }));
const countryWrap = countryBox.append(new El("div"));
const countryLabel = countryWrap.append(new El("label", { for: "_r_tg_" }));
countryLabel.append(new El("div", {}, ["In which country do you reside?*"]));
const countrySelect = countryWrap.append(
  new El("select", { id: "_r_tg_", required: "" }, [
    new El("option", { value: "" }, ["Select an option"]),
    new El("option", { value: "1" }, ["Argentina"]),
    new El("option", { value: "2" }, ["Brazil"])
  ])
);

/* ------------------------------------------------------------------ */
/* Load the extension modules                                          */
/* ------------------------------------------------------------------ */

const sandbox = { console, document, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });
vm.createContext(sandbox);

for (const file of ["shared/profile.js", "content/labels.js", "content/rules.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
}

const profile = JSON.parse(fs.readFileSync(path.join(root, "samples/profile.example.json"), "utf8"));
const labels = sandbox.window.JALabels;
const rules = sandbox.window.JARules;
labels.setVisibilityCheck(() => true);

let failures = 0;
let checks = 0;

const check = (name, actual, expected) => {
  checks += 1;
  if (actual !== expected) {
    failures += 1;
    console.log(`FAIL ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
};

const ruleId = (ctx) => {
  const result = rules.match(ctx, profile);
  return result ? result.rule.id : null;
};

/* ------------------------------------------------------------------ */
/* Field question rendered outside the input, without `for`            */
/* ------------------------------------------------------------------ */

const nameCtx = labels.buildContext(fullName);
check("full name label is discovered", nameCtx.label, "Nome completo *");
check("full name rule matches", ruleId(nameCtx), "personal.fullName");

const emailCtx = labels.buildContext(email);
check("email label is discovered", emailCtx.label, "E-mail *");
check("email rule matches", ruleId(emailCtx), "personal.email");
check(
  "email does not borrow the previous question",
  emailCtx.labels.some((item) => /nome completo/i.test(item.text)),
  false
);

/* ------------------------------------------------------------------ */
/* Readonly sizer textarea must not hide the label                     */
/* ------------------------------------------------------------------ */

const summaryCtx = labels.buildContext(summary);
check("textarea label is discovered next to its sizer", summaryCtx.label, "Resumo das qualificações *");

/* ------------------------------------------------------------------ */
/* Radio group question is used instead of the option text             */
/* ------------------------------------------------------------------ */

const genderCtx = labels.buildContext(radios[0]);
check(
  "radio group question is discovered",
  genderCtx.labels.some((item) => item.source === "group-question" && item.text === "Gênero *"),
  true
);
check("radio group rule matches the question", ruleId(genderCtx), "eligibility.gender");

/* ------------------------------------------------------------------ */
/* Label with nested text and `for` pointing at a React-style id       */
/* ------------------------------------------------------------------ */

const countryCtx = labels.buildContext(countrySelect);
check("nested label text is discovered", countryCtx.label, "In which country do you reside?*");
check("residence country rule matches", ruleId(countryCtx), "personal.country");

/* ------------------------------------------------------------------ */

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
