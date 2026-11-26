/**
 * Bilingual (English + pt-BR) matching tests.
 *
 * Run with: node tests/i18n.test.js
 *
 * The extension has no build step, so this loads the browser modules in a
 * Node vm with a tiny window/document stub. It covers the label matcher
 * (content/rules.js) and the option picker (content/filler.js).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { console, document: {}, Node: { ELEMENT_NODE: 1 } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const file of ["shared/profile.js", "content/labels.js", "content/rules.js", "content/filler.js"]) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInContext(source, sandbox, { filename: file });
}

const profile = JSON.parse(fs.readFileSync(path.join(root, "samples/profile.example.json"), "utf8"));
const rules = sandbox.window.JARules;
const filler = sandbox.window.JAFiller;

let failures = 0;
let checks = 0;

const check = (name, actual, expected) => {
  checks += 1;
  if (actual !== expected) {
    failures += 1;
    console.log(`FAIL ${name}\n  expected: ${expected}\n  actual:   ${actual}`);
  }
};

const buildContext = ({ label, name = "", options = [], tagName = "INPUT", type = "text", checkbox = false, radio = false, select = false }) => ({
  labels: [{ text: label, weight: 1, source: "label" }],
  text: label,
  nameString: name,
  autocomplete: "",
  options,
  optionsText: options.map((option) => `${option} ${option}`).join(" "),
  group: { index: 0, count: 1, text: "" },
  tagName,
  type,
  isCheckbox: checkbox,
  isRadio: radio,
  isSelect: select,
  isCombobox: false,
  isContentEditable: false,
  currentValue: "",
  required: true
});

const match = (label, extra = {}) => {
  const result = rules.match(buildContext({ label, ...extra }), profile);
  return result ? result.rule.id : null;
};

const value = (label, extra = {}) => {
  const result = rules.match(buildContext({ label, ...extra }), profile);
  return result ? result.value : null;
};

/* ------------------------------------------------------------------ */
/* Field matching                                                      */
/* ------------------------------------------------------------------ */

const cases = [
  // English
  ["What is your current location?", "personal.city"],
  ["City", "personal.city"],
  ["First name", "personal.firstName"],
  ["Last name", "personal.lastName"],
  ["Email address", "personal.email"],
  ["Phone number", "personal.phone"],
  ["CPF", "personal.cpf"],
  ["Date of birth", "personal.dateOfBirth"],
  ["Country", "personal.country", { select: true, tagName: "SELECT", options: ["Brazil", "United States"] }],
  ["In which country do you reside?", "personal.country", { select: true, tagName: "SELECT", options: ["Brazil", "United States"] }],
  ["What is your country of residence?", "personal.country", { select: true, tagName: "SELECT", options: ["Brazil", "United States"] }],
  ["Which country do you live in?", "personal.country", { select: true, tagName: "SELECT", options: ["Brazil", "United States"] }],
  ["In which country were you born?", "personal.birthCountry", { select: true, tagName: "SELECT", options: ["Brazil", "United States"] }],
  ["Where were you born?", "personal.birthCountry", { select: true, tagName: "SELECT", options: ["Brazil", "United States"] }],
  ["LinkedIn profile", "personal.linkedin"],
  ["Current company", "current.company"],
  ["Current or most recent job title", "current.title"],
  ["I currently work here", "current.current", { checkbox: true, type: "checkbox" }],
  ["How many years of experience do you have?", "experience.totalYears"],
  ["How many months of experience do you have?", "experience.totalMonths"],
  ["Are you legally authorized to work?", "eligibility.workAuthorization", { select: true, tagName: "SELECT", options: ["Yes", "No"] }],
  ["Will you require visa sponsorship?", "eligibility.sponsorship", { select: true, tagName: "SELECT", options: ["Yes", "No"] }],
  ["Gender", "eligibility.gender"],
  ["Race / ethnicity", "eligibility.ethnicity"],
  ["Veteran status", "eligibility.veteran"],
  ["Disability status", "eligibility.disability"],
  ["Expected salary", "preferences.expectedSalary"],
  ["Notice period", "preferences.noticePeriod"],
  ["Preferred place of work", "preferences.placeOfWork"],
  ["How did you hear about us?", "preferences.referral"],

  // Portuguese (Brazil)
  ["Qual é o seu nome?", "personal.firstName"],
  ["Nome", "personal.firstName"],
  ["Nome completo", "personal.fullName"],
  ["Seu nome completo", "personal.fullName"],
  ["Sobrenome", "personal.lastName"],
  ["Nome do meio", "personal.middleName"],
  ["Nome social", "personal.preferredName"],
  ["E-mail", "personal.email"],
  ["Telefone celular", "personal.phone"],
  ["DDI", "personal.phoneCountryCode", { select: true, tagName: "SELECT", options: ["+55", "+1"] }],
  ["CPF", "personal.cpf"],
  ["Data de nascimento", "personal.dateOfBirth"],
  ["Nacionalidade", "personal.nationality"],
  ["CEP", "personal.postalCode"],
  ["Endereço", "personal.address"],
  ["Cidade", "personal.city"],
  ["Estado", "personal.state"],
  ["País", "personal.country"],
  ["País onde reside", "personal.country"],
  ["País de nascimento", "personal.birthCountry"],
  ["Naturalidade", "personal.birthCountry"],
  ["Qual é a sua cidade?", "personal.city"],
  ["Empresa atual", "current.company"],
  ["Nome da Empresa", "current.company"],
  ["Razão social", "current.company"],
  ["Relação de Emprego", "current.employmentType", { select: true, tagName: "SELECT", options: ["CLT", "PJ", "Estágio"] }],
  ["Employment type", "current.employmentType", { select: true, tagName: "SELECT", options: ["Full-time", "Contract"] }],
  ["Principais Atividades Exercidas", "current.description"],
  ["Cargo atual", "current.title"],
  ["Local da empresa", "current.location"],
  ["Data de admissão", "current.startDate"],
  ["Data de saída", "current.endDate"],
  ["Início", "current.startDate"],
  ["Fim", "current.endDate"],
  ["Trabalho atualmente", "current.current", { checkbox: true, type: "checkbox" }],
  ["Descrição das atividades", "current.description"],
  ["Habilidades utilizadas", "current.skills"],
  ["Experiência profissional total", "experience.totalPair"],
  ["Experiência relevante", "experience.relevantPair"],
  ["Quantos anos de experiência você tem?", "experience.totalYears"],
  ["Habilidade principal", "skills.primary"],
  ["Competências adicionais", "skills.secondary"],
  ["Escolaridade", "education.degree"],
  ["Instituição de ensino", "education.school"],
  ["Área de formação", "education.field"],
  ["Pretensão salarial", "preferences.expectedSalary"],
  ["Pretensão de salário", "preferences.expectedSalary"],
  ["Faixa salarial", "preferences.expectedSalary"],
  ["Área de interesse", "current.roleCategory"],
  ["Moeda", "preferences.currency"],
  ["Nível de inglês", "preferences.englishLevel"],
  ["Modelo de trabalho", "preferences.placeOfWork"],
  ["Aviso prévio", "preferences.noticePeriod"],
  ["Como soube da vaga?", "preferences.referral"],
  ["Você precisa de patrocínio de visto?", "eligibility.sponsorship", { select: true, tagName: "SELECT", options: ["Sim", "Não"] }],
  ["Você é autorizado a trabalhar no Brasil?", "eligibility.workAuthorization", { select: true, tagName: "SELECT", options: ["Sim", "Não"] }],
  ["Autorização de trabalho", "eligibility.workAuthorization", { select: true, tagName: "SELECT", options: ["Sim", "Não"] }],
  ["Visto de trabalho", "eligibility.workAuthorization", { select: true, tagName: "SELECT", options: ["Sim", "Não"] }],
  ["Gênero", "eligibility.gender"],
  ["Qual é a sua identidade de gênero?", "eligibility.gender"],
  ["Raça/Cor", "eligibility.ethnicity"],
  ["Como você descreveria sua raça/etnia?", "eligibility.ethnicity"],
  ["Você é veterano?", "eligibility.veteran"],
  ["Pessoa com deficiência (PCD)", "eligibility.disability"]
];

for (const [label, expected, extra = {}] of cases) {
  check(`${JSON.stringify(label)} -> ${expected}`, match(label, extra), expected);
}

// False positives that would corrupt a real application.
check("Estado civil is not a state", match("Estado civil"), null);
check("Disponibilidade para viagens is not notice period", match("Disponibilidade para viagens"), null);
check("May we contact your current employer is not company", match("May we contact your current employer?"), null);
check("Endereço de e-mail is not a postal address", match("Endereço de e-mail"), "personal.email");
check("Nome da empresa is not a full name", match("Nome da empresa"), "current.company");
check("Área de formação is not escolaridade", match("Área de formação"), "education.field");
check("Cidade da empresa is not personal city", match("Cidade da empresa"), null);
check("País da empresa is not personal country", match("País da empresa"), null);
check("Nome do recrutador is not the candidate", match("Nome do recrutador"), null);
check("Site da empresa is not the candidate website", match("Site da empresa"), null);
check("LinkedIn da empresa is not the candidate profile", match("LinkedIn da empresa"), null);
check("Disponibilidade para trabalho presencial is not notice", match("Disponibilidade para trabalho presencial"), null);
check("Disponibilidade para mudança is not notice", match("Disponibilidade para mudança"), null);
check("A boolean answer is never typed into a text input", match("I currently work here"), null);

// Values read from the sample profile.
check("current location value", value("What is your current location?"), "São Paulo");
check("first name value", value("Qual é o seu nome?"), "Marina");
check("full name value", value("Nome completo"), "Marina Alves");
check("phone value", value("Telefone"), "+55 11999990000");

/* ------------------------------------------------------------------ */
/* Repeated work-history blocks                                        */
/* ------------------------------------------------------------------ */

const seqValue = (label, sequence, extra = {}) => {
  const result = rules.match({ ...buildContext({ label, ...extra }), ...sequence }, profile);
  return result ? result.value : null;
};
const previous = (index, total = 2) => ({ sequenceIndex: index, sequenceTotal: total, sequenceMode: "previous" });
const history = (index, total = 3) => ({ sequenceIndex: index, sequenceTotal: total, sequenceMode: "history" });

check("previous block 0 company", seqValue("Nome da Empresa", previous(0)), "Globex Corporation");
check("previous block 0 employment", seqValue("Relação de Emprego", previous(0), { select: true, tagName: "SELECT" }), "CLT");
check("previous block 1 company", seqValue("Nome da Empresa", previous(1)), "Initech Sistemas");
check("previous block 1 title", seqValue("Cargo", previous(1)), "Fullstack Developer Intern");
check("previous block 1 employment", seqValue("Relação de Emprego", previous(1), { select: true, tagName: "SELECT" }), "Estágio");
check("previous block 1 start", seqValue("Data de início", previous(1)), "2017-06");
check("previous block 1 end", seqValue("Data de saída", previous(1)), "2018-12");
check("extra empty block stays empty", seqValue("Nome da Empresa", previous(2, 3)), "");
check("history block 0 is the current role", seqValue("Nome da Empresa", history(0)), "Acme Software (Allocated at Banco Aurora)");
check("history block 0 employment", seqValue("Relação de Emprego", history(0), { select: true, tagName: "SELECT" }), "CLT");
check("history block 1 is the first previous role", seqValue("Nome da Empresa", history(1)), "Globex Corporation");
check("single field still uses the current role", seqValue("Nome da Empresa", { sequenceIndex: 0, sequenceTotal: 1, sequenceMode: "history" }), "Acme Software (Allocated at Banco Aurora)");

/* ------------------------------------------------------------------ */
/* Choice matching (selects / radios)                                  */
/* ------------------------------------------------------------------ */

const pick = (profileValue, optionTexts) => {
  const options = optionTexts.map((text) => ({ textContent: text, value: text, disabled: false }));
  const chosen = filler.pickOption(options, profileValue);
  return chosen ? chosen.textContent : null;
};

check(
  "English level in pt-BR select",
  pick("Professional working proficiency", ["Básico", "Intermediário", "Avançado", "Fluente", "Nativo"]),
  "Avançado"
);
check(
  "Native level in pt-BR select",
  pick("Native or bilingual proficiency", ["Básico", "Intermediário", "Avançado", "Fluente", "Nativo"]),
  "Nativo"
);
check(
  "Gender decline in pt-BR select",
  pick("Decline to self-identify", ["Mulher", "Homem", "Não binário", "Prefiro não informar"]),
  "Prefiro não informar"
);
check("Gender woman in pt-BR select", pick("Woman", ["Mulher", "Homem", "Prefiro não informar"]), "Mulher");
check("Race white in pt-BR select", pick("White", ["Branco", "Preto", "Pardo", "Indígena", "Prefiro não informar"]), "Branco");
check("Race asian in pt-BR select", pick("Asian", ["Branco", "Preto", "Pardo", "Amarelo", "Indígena"]), "Amarelo");
check(
  "Veteran negative in pt-BR select",
  pick("I am not a protected veteran", ["Sou veterano", "Não sou veterano", "Prefiro não informar"]),
  "Não sou veterano"
);
check("Work mode remote in pt-BR select", pick("Remote", ["Presencial", "Híbrido", "Remoto"]), "Remoto");
check("Work mode hybrid in pt-BR select", pick("Hybrid", ["Presencial", "Híbrido", "Remoto"]), "Híbrido");
check("Notice 30 days in pt-BR select", pick("30 days", ["Imediato", "15 dias", "30 dias", "60 dias"]), "30 dias");
check(
  "Associate degree in pt-BR select",
  pick("Associate's degree", ["Ensino Médio", "Ensino Superior Completo", "Pós-graduação"]),
  "Ensino Superior Completo"
);
check("Master degree in pt-BR select", pick("Master's degree", ["Graduação", "Pós-graduação", "Doutorado"]), "Pós-graduação");
check("Boolean yes in pt-BR select", pick(true, ["Sim", "Não"]), "Sim");
check("Boolean no in pt-BR select", pick(false, ["Sim", "Não"]), "Não");
check("Country Brazil in pt-BR select", pick("Brazil", ["Brasil", "Estados Unidos", "Portugal"]), "Brasil");

/* ------------------------------------------------------------------ */

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
