import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultKit, cleanKit } from "../kit.js";

const elements = (kit) => kit.sections.flatMap((section) => section.elements);
const element = (kit, id) => elements(kit).find((each) => each.id === id);
const fields = (result) => result.errors.map((error) => error.field);

function kitWith(element) {
  return { name: "Acme", notes: "", sections: [{ id: "extra", title: "Extra", elements: [element] }] };
}

test("a new kit starts with the sections of the Launchd brand form", () => {
  const kit = defaultKit("Acme");
  assert.equal(kit.name, "Acme");
  assert.deepEqual(kit.sections.map((section) => section.id),
    ["backgrounds-and-text", "accent", "brand-extras", "fonts", "borders", "preview-text"]);
  assert.equal(elements(kit).filter((each) => each.kind === "color").length, 13);
  assert.deepEqual(element(kit, "canvas"),
    { id: "canvas", label: "Page background", kind: "color", light: "#e8edea", dark: "#0f0a2e", source: { light: "Designer’s color", dark: "Added by Claude" } });
  assert.deepEqual(element(kit, "font-display-light"),
    { id: "font-display-light", label: "Secondary headlines", kind: "font", family: "Kanit", weight: 300, url: "", source: "Designer’s font" });
  assert.equal(element(kit, "border-thick").width, 2);
  assert.equal(elements(kit).filter((each) => each.kind === "text" && each.value === "").length, 9);
  assert.match(kit.sections.find((section) => section.id === "fonts").note, /Myriad Pro/);
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

test("a kit must have a name", () => {
  assert.deepEqual(fields(cleanKit({ ...defaultKit("Acme"), name: " " })), ["name"]);
});

test("cleaning drops fields that the rules do not know", () => {
  const { kit } = cleanKit({ ...kitWith({ id: "t", label: "T", kind: "text", value: "Hi", onclick: "x" }), members: { "a@b.c": "editor" } });
  assert.deepEqual(kit, { name: "Acme", notes: "", sections: [{ id: "extra", title: "Extra", elements: [{ id: "t", label: "T", kind: "text", value: "Hi" }] }] });
});
