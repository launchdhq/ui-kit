import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultKit, cleanKit, valueTag } from "../kit.js";

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
  assert.deepEqual(kit, { name: "Acme", notes: "", sections: [{ id: "extra", title: "Extra", elements: [{ id: "t", label: "T", kind: "text", value: "Hi" }] }] });
});
