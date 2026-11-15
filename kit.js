export const VERSION = 1;
export const KINDS = ["color", "font", "border", "text"];

export const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const FAMILY = /^[A-Za-z0-9 ]{1,60}$/;
export const FONT_FILE = /\.(woff2|woff|ttf|otf)$/i;
const FONT_HOSTS = ["use.typekit.net", "fonts.googleapis.com", "fonts.bunny.net"];

const color = (id, label, light, dark) => ({ id, label, kind: "color", light, dark });
const font = (id, label, family, weight) => ({ id, label, kind: "font", family, weight, url: "" });
const border = (id, label, width) => ({ id, label, kind: "border", width });
const text = (id, label) => ({ id, label, kind: "text", value: "" });

export const TAG_KEYS = { color: ["light", "dark"], font: ["font"], border: ["width"], text: [] };

export function defaultKit(name) {
  return {
    name,
    notes: "",
    labels: [],
    sections: [
      { id: "backgrounds-and-text", title: "Backgrounds and text", elements: [
        color("canvas", "Page background", "#ffffff", "#121212"),
        color("surface", "Cards and panels", "#f7f7f7", "#1e1e1e"),
        color("subtle", "Quiet fills, secondary buttons", "#eeeeee", "#2a2a2a"),
        color("fg", "Body text and headings", "#111111", "#f2f2f2"),
        color("muted", "Secondary text", "#666666", "#a3a3a3"),
        color("border", "Lines and card edges", "#dddddd", "#333333"),
      ] },
      { id: "accent", title: "Accent", elements: [
        color("accent", "Primary buttons, focus rings", "#111111", "#f2f2f2"),
        color("on-accent", "Text on primary buttons", "#ffffff", "#111111"),
        color("accent-soft", "Hover fills and badges", "#eeeeee", "#2a2a2a"),
        color("accent-text", "Link text", "#111111", "#f2f2f2"),
      ] },
      { id: "extras", title: "Extras", elements: [
        color("highlight", "Highlighted words and bands", "#fff3a3", "#fff3a3"),
        color("on-highlight", "Text on the highlight color", "#111111", "#111111"),
        color("decorative", "Decorative fills", "#dddddd", "#333333"),
      ] },
      { id: "fonts", title: "Fonts", elements: [
        font("font-display", "Headlines", "Inter", 600),
        font("font-display-light", "Secondary headlines", "Inter", 400),
        font("font-sans", "Body text", "Inter", 400),
      ] },
      { id: "borders", title: "Borders", elements: [
        border("border-thin", "Lines and card edges", 1),
        border("border-thick", "Cards that stand out, focus rings", 2),
      ] },
      { id: "preview-text", title: "Preview text", elements: [
        text("headline", "Main headline"),
        text("subheadline", "Secondary headline"),
        text("body", "Body text"),
        text("button-primary", "Primary button"),
        text("button-secondary", "Secondary button"),
        text("link", "Link"),
        text("card-title", "Card title"),
        text("card-body", "Card text"),
        text("badge", "Badge"),
      ] },
    ],
  };
}

const isText = (value, max, min = 0) => typeof value === "string" && value.trim().length >= min && value.length <= max;
const isWhole = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export function isFontUrl(value) {
  if (value === "") return true;
  let url;
  try { url = new URL(value); } catch { return false; }
  return url.protocol === "https:" && (FONT_FILE.test(url.pathname) || FONT_HOSTS.includes(url.hostname));
}

const STARTING_VALUES = new Map(defaultKit("").sections.flatMap((section) => section.elements).map((element) => [element.id, element]));

export function valueTag(element, keys) {
  const start = STARTING_VALUES.get(element?.id);
  const same = start !== undefined && start.kind === element.kind && keys.every((key) => String(start[key]).toLowerCase() === String(element[key]).toLowerCase());
  return same ? "Default" : "Custom";
}

const RULES = {
  color: {
    light: [(value) => HEX.test(value), "Write # and six hex digits, for example #1a1051."],
    dark: [(value) => HEX.test(value), "Write # and six hex digits, for example #1a1051."],
  },
  font: {
    family: [(value) => typeof value === "string" && FAMILY.test(value), "Write a font name with only letters, digits and spaces."],
    weight: [(value) => isWhole(value, 100, 900) && value % 100 === 0, "Use a weight from 100 to 900, in steps of 100."],
    url: [(value) => value === undefined || (typeof value === "string" && isFontUrl(value)), "Use an https link to a font file (.woff2, .woff, .ttf, .otf), or to Adobe Fonts, Google Fonts or Bunny Fonts."],
  },
  border: {
    width: [(value) => isWhole(value, 0, 16), "Use a whole number from 0 to 16."],
  },
  text: {
    value: [(value) => isText(value, 200), "Use 200 characters or fewer."],
  },
};

export function cleanKit(input) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  const seen = new Set();
  const kit = { name: typeof input?.name === "string" ? input.name.trim() : "", notes: input?.notes ?? "", labels: [], sections: [] };

  if (!isText(kit.name, 80, 1)) fail("name", "Write a name of 1 to 80 characters.");
  if (!isText(kit.notes, 5000)) fail("notes", "Use 5000 characters or fewer.");
  const labels = Array.isArray(input?.labels) ? input.labels : [];
  if (labels.length > 20) fail("labels", "Use 20 labels or fewer.");
  labels.forEach((label, n) => {
    if (!isText(label, 30, 1)) fail(`labels.${n}`, "Write a label of 1 to 30 characters.");
    else if (kit.labels.includes(label.trim())) fail(`labels.${n}`, "This label is already in the list.");
    else kit.labels.push(label.trim());
  });

  (Array.isArray(input?.sections) ? input.sections : []).forEach((section, s) => {
    const at = `sections.${s}`;
    if (!ID.test(section?.id ?? "")) fail(`${at}.id`, "Use lowercase letters, digits and dashes.");
    if (!isText(section?.title, 80, 1)) fail(`${at}.title`, "Write a title of 1 to 80 characters.");
    const cleanSection = { id: section?.id, title: section?.title, elements: [] };
    if (section?.note !== undefined && !isText(section.note, 300)) fail(`${at}.note`, "Use 300 characters or fewer.");
    else if (section?.note) cleanSection.note = section.note;

    (Array.isArray(section?.elements) ? section.elements : []).forEach((element, e) => {
      const here = `${at}.elements.${e}`;
      if (!ID.test(element?.id ?? "")) fail(`${here}.id`, "Use lowercase letters, digits and dashes.");
      else if (seen.has(element.id)) fail(`${here}.id`, "This id is already in the kit. Use a different id.");
      seen.add(element?.id);
      if (!isText(element?.label, 120)) fail(`${here}.label`, "Use 120 characters or fewer.");
      if (!Object.hasOwn(RULES, element?.kind ?? "")) return fail(`${here}.kind`, `Use one of: ${KINDS.join(", ")}.`);
      const rules = RULES[element.kind];

      const cleanElement = { id: element.id, label: element.label, kind: element.kind };
      for (const [key, [valid, message]] of Object.entries(rules)) {
        if (!valid(element[key])) fail(`${here}.${key}`, message);
        else if (element[key] !== undefined) cleanElement[key] = element[key];
      }
      const tags = Object.fromEntries(TAG_KEYS[element.kind]
        .filter((key) => kit.labels.includes(element.tags?.[key]))
        .map((key) => [key, element.tags[key]]));
      if (Object.keys(tags).length) cleanElement.tags = tags;
      cleanSection.elements.push(cleanElement);
    });
    kit.sections.push(cleanSection);
  });

  return { kit, errors };
}

export function toCss(kit) {
  const elements = kit.sections.flatMap((section) => section.elements);
  const colors = elements.filter((element) => element.kind === "color");
  const fonts = elements.filter((element) => element.kind === "font");
  const googleWeights = new Map();
  const imports = new Set();
  const faces = [];
  for (const { family, weight, url } of fonts) {
    if (!url) googleWeights.set(family, new Set([...(googleWeights.get(family) ?? []), weight]));
    else if (FONT_FILE.test(new URL(url).pathname)) faces.push(`@font-face {\n  font-family: "${family}";\n  src: url(${JSON.stringify(url)});\n  font-weight: ${weight};\n}`);
    else imports.add(url);
  }
  for (const [family, weights] of googleWeights) {
    imports.add(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${[...weights].sort((a, b) => a - b).join(";")}&display=swap`);
  }
  const block = (selector, lines, indent = "") => `${indent}${selector} {\n${lines.map((line) => `${indent}  ${line}`).join("\n")}\n${indent}}`;
  const light = [
    ...colors.map((element) => `--${element.id}: ${element.light.toLowerCase()};`),
    ...fonts.flatMap((element) => [`--${element.id}: "${element.family}", sans-serif;`, `--${element.id}-weight: ${element.weight};`]),
    ...elements.filter((element) => element.kind === "border").map((element) => `--${element.id}: ${element.width}px;`),
  ];
  const name = kit.name.replaceAll("*/", "").replace(/\s+/g, " ").trim();
  return [
    `/* ${name} UI kit */`,
    ...[...imports].map((url) => `@import url(${JSON.stringify(url)});`),
    ...faces,
    block(":root", light),
    `@media (prefers-color-scheme: dark) {\n${block(":root", colors.map((element) => `--${element.id}: ${element.dark.toLowerCase()};`), "  ")}\n}`,
  ].join("\n\n") + "\n";
}
