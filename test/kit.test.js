import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultKit, cleanKit, toCss, valueTag } from "../kit.js";

const elements = (kit) => kit.sections.flatMap((section) => section.elements);
const element = (kit, id) => elements(kit).find((each) => each.id === id);
const fields = (result) => result.errors.map((error) => error.field);

function kitWith(element) {
  return { name: "Acme", notes: "", sections: [{ id: "extra", title: "Extra", elements: [element] }] };
}

test("a new kit starts with neutral values and no brand", () => {
  const kit = defaultKit("Acme");
  assert.equal(kit.name, "Acme");
  assert.equal(elements(kit).filter((each) => each.kind === "text" && each.value === "").length, 9);
  assert.deepEqual(kit.sections.map((section) => section.id),
    ["backgrounds-and-text", "accent", "extras", "fonts", "borders", "preview-text"]);
  assert.equal(elements(kit).filter((each) => each.kind === "color").length, 13);
  assert.deepEqual(element(kit, "canvas"), { id: "canvas", label: "Page background", kind: "color", light: "#ffffff", dark: "#121212" });
  assert.deepEqual(element(kit, "decorative"), { id: "decorative", label: "Decorative fills", kind: "color", light: "#dddddd", dark: "#333333" });
  assert.deepEqual(element(kit, "font-display"), { id: "font-display", label: "Headlines", kind: "font", family: "Inter", weight: 600, url: "" });
  assert.deepEqual(elements(kit).filter((each) => each.kind === "font").map((each) => each.family), ["Inter", "Inter", "Inter"]);
  assert.deepEqual(elements(kit).filter((each) => each.kind === "border").map((each) => each.width), [1, 2]);
  assert.equal(elements(kit).filter((each) => each.source || each.id === "lavender").length, 0);
  assert.equal(kit.sections.filter((section) => section.note).length, 0);
});

test("a value equal to its starting value is Default, and a changed value is Custom", () => {
  const canvas = element(defaultKit("Acme"), "canvas");
  assert.equal(valueTag(canvas, ["light"]), "Default");
  assert.equal(valueTag({ ...canvas, light: "#FFFFFF" }, ["light"]), "Default");
  assert.equal(valueTag({ ...canvas, dark: "#000000" }, ["light"]), "Default");
  assert.equal(valueTag({ ...canvas, dark: "#000000" }, ["dark"]), "Custom");
  const font = element(defaultKit("Acme"), "font-sans");
  assert.equal(valueTag({ ...font, weight: 500 }, ["family", "weight", "url"]), "Custom");
});

test("an element that someone added is Custom", () => {
  assert.equal(valueTag({ id: "error-text", kind: "color", light: "#000000", dark: "#ffffff" }, ["light"]), "Custom");
  assert.equal(valueTag(undefined, ["light"]), "Custom");
});

test("the rules drop a source field", () => {
  const { kit } = cleanKit(kitWith({ id: "c", label: "C", kind: "color", light: "#000000", dark: "#ffffff", source: "Added by Claude" }));
  assert.equal(kit.sections[0].elements[0].source, undefined);
});

test("a new kit passes its own rules", () => {
  assert.deepEqual(cleanKit(defaultKit("Acme")).errors, []);
});

test("a color must be # and six hex digits", () => {
  const result = cleanKit(kitWith({ id: "brand", label: "Brand", kind: "color", light: "#12345", dark: "red" }));
  assert.deepEqual(fields(result), ["sections.0.elements.0.light", "sections.0.elements.0.dark"]);
});

test("a font family has only letters, digits and spaces", () => {
  const result = cleanKit(kitWith({ id: "f", label: "F", kind: "font", family: "Kanit;}body{x", weight: 400 }));
  assert.deepEqual(fields(result), ["sections.0.elements.0.family"]);
});

test("a font weight is 100 to 900 in steps of 100", () => {
  for (const weight of [50, 450, 1000, "400"]) {
    const result = cleanKit(kitWith({ id: "f", label: "F", kind: "font", family: "Kanit", weight }));
    assert.deepEqual(fields(result), ["sections.0.elements.0.weight"], `weight ${weight}`);
  }
});

test("a font URL is a font file or a stylesheet from a known font service", () => {
  const accepted = ["", "https://cdn.example.com/fonts/Myriad.woff2", "https://cdn.example.com/a.otf?v=2",
    "https://use.typekit.net/abc1def.css", "https://fonts.bunny.net/css?family=kanit:500"];
  for (const url of accepted) {
    const result = cleanKit(kitWith({ id: "f", label: "F", kind: "font", family: "Myriad Pro", weight: 400, url }));
    assert.deepEqual(result.errors, [], url);
  }
  const refused = ["http://cdn.example.com/Myriad.woff2", "https://evil.example.com/fonts.css",
    "javascript:alert(1)", "https://use.typekit.net.evil.com/a.css", "not a url"];
  for (const url of refused) {
    const result = cleanKit(kitWith({ id: "f", label: "F", kind: "font", family: "Myriad Pro", weight: 400, url }));
    assert.deepEqual(fields(result), ["sections.0.elements.0.url"], url);
  }
});

test("a border width is a whole number from 0 to 16", () => {
  for (const width of [-1, 17, 1.5, "2"]) {
    const result = cleanKit(kitWith({ id: "b", label: "B", kind: "border", width }));
    assert.deepEqual(fields(result), ["sections.0.elements.0.width"], `width ${width}`);
  }
});

test("a preview text has at most 200 characters", () => {
  const result = cleanKit(kitWith({ id: "t", label: "T", kind: "text", value: "x".repeat(201) }));
  assert.deepEqual(fields(result), ["sections.0.elements.0.value"]);
});

test("an element id is used only once in a kit", () => {
  const kit = defaultKit("Acme");
  kit.sections[1].elements.push({ id: "canvas", label: "Again", kind: "color", light: "#000000", dark: "#ffffff" });
  assert.deepEqual(fields(cleanKit(kit)), ["sections.1.elements.4.id"]);
});

test("an element kind must be color, font, border or text", () => {
  const result = cleanKit(kitWith({ id: "s", label: "S", kind: "shadow" }));
  assert.deepEqual(fields(result), ["sections.0.elements.0.kind"]);
});

test("a kind that is a name on every object, such as constructor, is refused", () => {
  for (const kind of ["constructor", "toString", "__proto__"]) {
    const result = cleanKit(kitWith({ id: "s", label: "S", kind }));
    assert.deepEqual(fields(result), ["sections.0.elements.0.kind"], kind);
  }
});

test("a section note has at most 300 characters", () => {
  const kit = defaultKit("Acme");
  kit.sections[0].note = "x".repeat(301);
  assert.deepEqual(fields(cleanKit(kit)), ["sections.0.note"]);
});

test("a kit must have a name", () => {
  assert.deepEqual(fields(cleanKit({ ...defaultKit("Acme"), name: " " })), ["name"]);
});

test("cleaning drops fields that the rules do not know", () => {
  const { kit } = cleanKit({ ...kitWith({ id: "t", label: "T", kind: "text", value: "Hi", onclick: "x" }), members: { "a@b.c": "editor" } });
  assert.deepEqual(kit, { name: "Acme", notes: "", labels: [], sections: [{ id: "extra", title: "Extra", elements: [{ id: "t", label: "T", kind: "text", value: "Hi" }] }] });
});

const cssKit = {
  name: "Acme */ body{}",
  notes: "",
  sections: [
    { id: "colors", title: "Colors", elements: [
      { id: "canvas", label: "Page background", kind: "color", light: "#ffffff", dark: "#121212" },
      { id: "accent", label: "Buttons", kind: "color", light: "#1A1051", dark: "#9290f4" },
    ] },
    { id: "fonts", title: "Fonts", elements: [
      { id: "font-display", label: "Headlines", kind: "font", family: "Kanit", weight: 500, url: "" },
      { id: "font-display-light", label: "Light", kind: "font", family: "Kanit", weight: 300, url: "" },
      { id: "font-body", label: "Body", kind: "font", family: "Myriad Pro", weight: 400, url: "https://use.typekit.net/abc1def.css" },
      { id: "font-mono", label: "Code", kind: "font", family: "Berkeley Mono", weight: 400, url: "https://cdn.example.com/berkeley.woff2" },
    ] },
    { id: "borders", title: "Borders", elements: [{ id: "border-thin", label: "Lines", kind: "border", width: 1 }] },
    { id: "text", title: "Preview text", elements: [{ id: "headline", label: "Headline", kind: "text", value: "Hello" }] },
  ],
};

test("the CSS has the light values in :root and the dark colors in a dark-mode block", () => {
  const [light, dark] = toCss(cssKit).split("@media (prefers-color-scheme: dark)");
  assert.match(light, /:root \{[^}]*--canvas: #ffffff;[^}]*--accent: #1a1051;/);
  assert.match(light, /--font-display: "Kanit", sans-serif;\n\s+--font-display-weight: 500;/);
  assert.match(light, /--border-thin: 1px;/);
  assert.match(dark, /:root \{[^}]*--canvas: #121212;[^}]*--accent: #9290f4;/);
  assert.doesNotMatch(dark, /font|border/);
});

test("the CSS loads each font: Google Fonts, a font service, or a font file", () => {
  const css = toCss(cssKit);
  assert.match(css, /@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=Kanit:wght@300;500&display=swap"\);/);
  assert.match(css, /@import url\("https:\/\/use\.typekit\.net\/abc1def\.css"\);/);
  assert.match(css, /@font-face \{\n\s+font-family: "Berkeley Mono";\n\s+src: url\("https:\/\/cdn\.example\.com\/berkeley\.woff2"\);\n\s+font-weight: 400;/);
  assert.ok(css.indexOf("@import") < css.indexOf(":root"), "@import comes before every other rule");
});

test("the CSS leaves out preview text, and a name cannot end its comment", () => {
  const css = toCss(cssKit);
  assert.doesNotMatch(css, /headline|Hello/);
  assert.equal(css.split("*/").length, 2);
  assert.match(css, /^\/\* Acme body\{\} UI kit \*\//);
});

const labelled = (labels, element) => ({ ...kitWith(element), labels });
const color = { id: "c", label: "C", kind: "color", light: "#000000", dark: "#ffffff" };

test("a new kit has an empty list of labels", () => {
  assert.deepEqual(defaultKit("Acme").labels, []);
  assert.deepEqual(cleanKit(defaultKit("Acme")).kit.labels, []);
});

test("a kit keeps its labels and the label of each value", () => {
  const { kit, errors } = cleanKit(labelled(["By Claude", "By designer"], { ...color, tags: { light: "By Claude", dark: "By designer" } }));
  assert.deepEqual(errors, []);
  assert.deepEqual(kit.labels, ["By Claude", "By designer"]);
  assert.deepEqual(kit.sections[0].elements[0].tags, { light: "By Claude", dark: "By designer" });
});

test("a value loses a label that is not in the kit's list, or that sits on a key the kind does not have", () => {
  const { kit, errors } = cleanKit(labelled(["By Claude"], { ...color, tags: { light: "Removed label", dark: "By Claude", width: "By Claude" } }));
  assert.deepEqual(errors, []);
  assert.deepEqual(kit.sections[0].elements[0].tags, { dark: "By Claude" });
});

test("fonts and borders take one label each", () => {
  const font = { id: "f", label: "F", kind: "font", family: "Inter", weight: 400, url: "", tags: { font: "By Claude" } };
  const border = { id: "b", label: "B", kind: "border", width: 1, tags: { width: "By Claude" } };
  assert.deepEqual(cleanKit(labelled(["By Claude"], font)).kit.sections[0].elements[0].tags, { font: "By Claude" });
  assert.deepEqual(cleanKit(labelled(["By Claude"], border)).kit.sections[0].elements[0].tags, { width: "By Claude" });
});

test("a label has 1 to 30 characters, appears once, and a kit has at most 20 labels", () => {
  assert.deepEqual(fields(cleanKit(labelled([" ", "x".repeat(31), "Ok", "Ok"], color))), ["labels.0", "labels.1", "labels.3"]);
  assert.deepEqual(fields(cleanKit(labelled(Array.from({ length: 21 }, (_, n) => `Label ${n}`), color))), ["labels"]);
});
