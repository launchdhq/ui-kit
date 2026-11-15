export const VERSION = 1;
export const KINDS = ["color", "font", "border", "text"];

const DESIGNER = "Designer’s color";
const CLAUDE = "Added by Claude";
const SOURCE = { d: DESIGNER, c: CLAUDE };

export const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const FAMILY = /^[A-Za-z0-9 ]{1,60}$/;
export const FONT_FILE = /\.(woff2|woff|ttf|otf)$/i;
const FONT_HOSTS = ["use.typekit.net", "fonts.googleapis.com", "fonts.bunny.net"];

const color = (id, label, light, dark, sourceLight, sourceDark) =>
  ({ id, label, kind: "color", light, dark, source: { light: SOURCE[sourceLight], dark: SOURCE[sourceDark] } });
const font = (id, label, family, weight, source) =>
  ({ id, label, kind: "font", family, weight, url: "", source });
const border = (id, label, width) => ({ id, label, kind: "border", width });
const text = (id, label) => ({ id, label, kind: "text", value: "" });

export function defaultKit(name) {
  return {
    name,
    notes: "",
    sections: [
      { id: "backgrounds-and-text", title: "Backgrounds and text", elements: [
        color("canvas", "Page background", "#e8edea", "#0f0a2e", "d", "c"),
        color("surface", "Cards and panels", "#ffffff", "#1a1051", "c", "d"),
        color("subtle", "Quiet fills, secondary buttons", "#dbe2de", "#251a6b", "c", "c"),
        color("fg", "Body text and headings", "#1a1051", "#e8edea", "d", "d"),
        color("muted", "Secondary text", "#5b5680", "#a9a7d6", "c", "c"),
        color("border", "Lines and card edges", "#c9d1cc", "#2f2580", "c", "c"),
      ] },
      { id: "accent", title: "Accent", elements: [
        color("accent", "Primary buttons, focus rings", "#1a1051", "#9290f4", "d", "d"),
        color("on-accent", "Text on primary buttons", "#ffffff", "#1a1051", "c", "d"),
        color("accent-soft", "Hover fills and badges", "#e0dffd", "#2b2370", "c", "c"),
        color("accent-text", "Link text", "#3d38a6", "#c4c3fa", "c", "c"),
      ] },
      { id: "brand-extras", title: "Brand extras", elements: [
        color("highlight", "Highlighted words and bands", "#fff35a", "#fff35a", "d", "d"),
        color("on-highlight", "Text on the highlight color", "#1a1051", "#1a1051", "d", "d"),
        color("lavender", "Decorative fills", "#9290f4", "#9290f4", "d", "d"),
      ] },
      { id: "fonts", title: "Fonts", note: "The brand sheet names Myriad Pro. Google Fonts does not have it, so Source Sans 3 is the stand-in.", elements: [
        font("font-display", "Headlines", "Kanit", 500, "Designer’s font"),
        font("font-display-light", "Secondary headlines", "Kanit", 300, "Designer’s font"),
        font("font-sans", "Body text", "Source Sans 3", 400, "Added by Claude"),
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

function cleanSource(source) {
  if (isText(source, 40)) return source;
  if (source && isText(source.light, 40) && isText(source.dark, 40)) return { light: source.light, dark: source.dark };
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
  const kit = { name: typeof input?.name === "string" ? input.name.trim() : "", notes: input?.notes ?? "", sections: [] };

  if (!isText(kit.name, 80, 1)) fail("name", "Write a name of 1 to 80 characters.");
  if (!isText(kit.notes, 5000)) fail("notes", "Use 5000 characters or fewer.");

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
      const source = cleanSource(element.source);
      if (source) cleanElement.source = source;
      cleanSection.elements.push(cleanElement);
    });
    kit.sections.push(cleanSection);
  });

  return { kit, errors };
}
