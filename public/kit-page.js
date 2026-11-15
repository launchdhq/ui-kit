import { FAMILY, FONT_FILE, HEX, KINDS, isFontUrl } from "/kit.js";
import { ROLE_LABELS, api, download, formatSaved, h, renderTopbar, setStatus, slug } from "/ui.js";

const id = window.location.pathname.split("/").pop();
const status = document.getElementById("status");
const sectionsElement = document.getElementById("sections");
const notes = document.getElementById("notes");
const saveButton = document.getElementById("save");

const KIND_LABELS = { color: "Color", font: "Font", border: "Border", text: "Preview text" };
const WEIGHTS = { 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" };
const PREVIEW_COLORS = ["canvas", "surface", "subtle", "fg", "muted", "border", "accent", "on-accent", "accent-soft", "accent-text", "highlight", "on-highlight", "lavender"];
const PREVIEW_FONTS = ["font-display", "font-display-light", "font-sans"];
const LOREM = {
  headline: "Lorem ipsum dolor sit amet",
  subheadline: "Consectetur adipiscing elit",
  body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.",
  "button-primary": "Lorem ipsum",
  "button-secondary": "Dolor sit",
  link: "Amet consectetur",
  "card-title": "Lorem ipsum",
  "card-body": "Dolor sit amet, consectetur",
  badge: "Lorem",
};

let kit;
let role;
let dirty = false;
const canEdit = () => role === "owner" || role === "editor";
const elements = () => kit.sections.flatMap((section) => section.elements);
const find = (elementId) => elements().find((element) => element.id === elementId);
let borderPainters = [];

function uniqueId(text) {
  const base = slug(text, "item");
  const taken = new Set([...elements().map((element) => element.id), ...kit.sections.map((section) => section.id)]);
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}

function changed() {
  dirty = true;
  setStatus(status, "You have changes that are not saved.");
  refreshPreview();
}

function textInput(props) {
  return h("input", { class: "input", type: "text", autocomplete: "off", spellcheck: false, disabled: !canEdit(), ...props });
}

function colorCell(element, mode, field) {
  const value = element[mode];
  const source = typeof element.source === "object" ? element.source?.[mode] : undefined;
  const text = textInput({ value, maxLength: 7, "aria-label": `${element.id} ${mode} value`, "data-field": `${field}.${mode}` });
  const swatch = canEdit()
    ? h("input", { type: "color", class: "picker", value: HEX.test(value) ? value.toLowerCase() : "#000000", "aria-label": `${element.id} ${mode} picker`,
      onInput: (event) => { text.value = event.target.value; element[mode] = event.target.value; changed(); } })
    : h("span", { class: "chip", style: HEX.test(value) ? `background: ${value}` : "" });
  text.addEventListener("input", () => {
    element[mode] = text.value.trim();
    if (HEX.test(element[mode]) && swatch.type === "color") swatch.value = element[mode].toLowerCase();
    changed();
  });
  return h("div", { class: `cell mode ${mode}` },
    h("div", { class: "pair" }, swatch, text),
    source && h("span", { class: `source${source.startsWith("Designer") ? " from-designer" : ""}` }, source));
}

function borderCell(element, mode, field) {
  const sample = h("span", { class: "border-sample", "aria-hidden": "true" });
  borderPainters.push(() => {
    const borderColor = find("border")?.[mode];
    sample.style.borderWidth = `${Number.isInteger(element.width) ? element.width : 0}px`;
    sample.style.borderColor = HEX.test(borderColor ?? "") ? borderColor : "currentColor";
  });
  const parts = [sample];
  if (mode === "light") {
    parts.push(h("input", { class: "input width-input", type: "number", min: 0, max: 16, step: 1, value: element.width, disabled: !canEdit(),
      "aria-label": `${element.id} width in px`, "data-field": `${field}.width`,
      onInput: (event) => { element.width = event.target.value === "" ? null : Number(event.target.value); changed(); } }), h("span", { class: "small" }, "px"));
  } else {
    parts.push(h("span", { class: "small", style: "opacity: .75" }, "Dark mode"));
  }
  return h("div", { class: `cell mode ${mode}` }, h("div", { class: "pair" }, ...parts));
}

function fontCells(element, field) {
  const warning = h("span", { class: "font-warning", hidden: true }, "This font did not load. Check the name, the weight and the link. The preview uses a stand-in font.");
  const sample = h("span", { class: "sample" }, "Aa Bb Cc 123");
  const paint = () => {
    sample.style.fontFamily = FAMILY.test(element.family) ? `"${element.family}", ui-sans-serif, sans-serif` : "";
    sample.style.fontWeight = String(element.weight);
  };
  let latest = 0;
  const reload = () => {
    paint();
    const attempt = ++latest;
    loadFont(element).then((ok) => { if (attempt === latest) warning.hidden = ok; });
  };
  const family = textInput({ value: element.family, maxLength: 60, "aria-label": `${element.id} font family`, "data-field": `${field}.family`,
    onInput: (event) => { element.family = event.target.value.trim(); paint(); changed(); }, onChange: reload });
  const url = textInput({ value: element.url ?? "", placeholder: "Font URL (optional)", "aria-label": `${element.id} font URL`, "data-field": `${field}.url`,
    onInput: (event) => { element.url = event.target.value.trim(); changed(); }, onChange: reload });
  const weight = h("select", { class: "input", disabled: !canEdit(), "aria-label": `${element.id} font weight`, "data-field": `${field}.weight`,
    onChange: (event) => { element.weight = Number(event.target.value); reload(); changed(); } },
  Object.entries(WEIGHTS).map(([value, name]) => h("option", { value, selected: Number(value) === element.weight }, `${value} ${name}`)));
  reload();
  return [
    h("div", { class: "cell" }, family, url,
      canEdit() && h("span", { class: "small muted" }, "Leave the URL empty for Google Fonts. For Adobe Fonts, add this app's address to the kit's domains."),
      element.source && h("span", { class: `source${element.source.startsWith("Designer") ? " from-designer" : ""}` }, element.source)),
    h("div", { class: "cell" }, weight, sample, warning),
  ];
}

const loadedFonts = new Map();
function loadFont({ family, weight, url = "" }) {
  if (!FAMILY.test(family ?? "") || (url && !isFontUrl(url))) return Promise.resolve(false);
  const key = `${family}|${weight}|${url}`;
  if (!loadedFonts.has(key)) loadedFonts.set(key, (async () => {
    try {
      if (url && FONT_FILE.test(new URL(url).pathname)) {
        document.fonts.add(await new FontFace(family, `url(${JSON.stringify(new URL(url).href)})`, { weight: String(weight) }).load());
      } else {
        const href = url || `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weight}&display=swap`;
        await new Promise((resolve) => document.head.append(h("link", { rel: "stylesheet", href, onLoad: resolve, onError: resolve })));
      }
      return (await document.fonts.load(`${weight} 16px "${family}"`)).length > 0;
    } catch {
      return false;
    }
  })());
  return loadedFonts.get(key);
}

function row(section, element, s, e) {
  const field = `sections.${s}.elements.${e}`;
  const cells = {
    color: () => [colorCell(element, "light", field), colorCell(element, "dark", field)],
    border: () => [borderCell(element, "light", field), borderCell(element, "dark", field)],
    font: () => fontCells(element, field),
    text: () => [h("div", { class: "cell wide" }, textInput({ value: element.value, maxLength: 200, placeholder: LOREM[element.id] ?? "Lorem ipsum",
      "aria-label": `${element.label || element.id} text`, "data-field": `${field}.value`, onInput: (event) => { element.value = event.target.value; changed(); } }))],
  }[element.kind];
  return h("div", { class: `row${canEdit() ? "" : " viewing"}` },
    h("div", { class: "name" }, h("code", {}, element.id), h("span", {}, element.label)),
    ...(cells ? cells() : []),
    canEdit() && h("button", { type: "button", class: "icon-button", "aria-label": `Remove ${element.label || element.id}`,
      onClick: () => { section.elements.splice(e, 1); render(); changed(); } }, "✕"));
}

function columns(section) {
  const kinds = new Set(section.elements.map((element) => element.kind));
  if (!kinds.size) return null;
  const [a, b] = kinds.size > 1 ? ["Value", ""]
    : { color: ["Light", "Dark"], border: ["Light", "Dark"], font: ["Font family and URL", "Weight"], text: ["Text", ""] }[[...kinds][0]] ?? ["Value", ""];
  return h("div", { class: `cols${canEdit() ? "" : " viewing"}`, "aria-hidden": "true" }, h("span", {}, "Token"), h("span", {}, a), h("span", {}, b));
}

function addElementForm(section) {
  const kind = h("select", { class: "input", "aria-label": `Kind of the new element in ${section.title}` },
    KINDS.map((value) => h("option", { value }, KIND_LABELS[value])));
  const label = h("input", { class: "input", required: true, maxLength: 120, placeholder: "What it is for, for example Error text", autocomplete: "off",
    "aria-label": `Label of the new element in ${section.title}` });
  return h("form", { class: "add-element no-print", onSubmit: (event) => {
    event.preventDefault();
    const base = { id: uniqueId(label.value), label: label.value.trim(), kind: kind.value };
    const defaults = { color: { light: "#000000", dark: "#ffffff" }, font: { family: "Inter", weight: 400, url: "" }, border: { width: 1 }, text: { value: "" } };
    section.elements.push({ ...base, ...defaults[kind.value] });
    render();
    changed();
  } }, kind, h("div", { class: "field grow" }, label), h("button", { type: "submit", class: "button quiet" }, "+ Add element"));
}

function render() {
  borderPainters = [];
  sectionsElement.replaceChildren(...kit.sections.map((section, s) => h("section", { class: "section", "aria-label": section.title },
    h("div", { class: "section-head" }, h("h2", {}, section.title),
      canEdit() && h("button", { type: "button", class: "button quiet no-print", "aria-label": `Remove the section ${section.title}`,
        onClick: () => {
          if (section.elements.length && !window.confirm(`Remove the section "${section.title}" and its ${section.elements.length} elements?`)) return;
          kit.sections.splice(s, 1); render(); changed();
        } }, "Remove section")),
    columns(section),
    ...section.elements.map((element, e) => row(section, element, s, e)),
    section.note && h("p", { class: "small muted", style: "margin: 6px 0 0" }, section.note),
    canEdit() && addElementForm(section))));
  refreshPreview();
}

function buildPreview(container, mode) {
  const slots = {};
  const slot = (tag, key, props = {}) => (slots[key] = h(tag, props));
  container.replaceChildren(
    h("span", { class: "tag" }, mode === "light" ? "Light mode" : "Dark mode"),
    slot("h3", "headline"),
    slot("h4", "subheadline"),
    slot("p", "body"),
    h("div", { class: "btns" }, slot("span", "button-primary", { class: "b1" }), slot("span", "button-secondary", { class: "b2" }), slot("span", "link", { class: "link" })),
    h("div", { class: "pcard" }, h("span", { class: "dot" }), h("div", {}, slot("strong", "card-title"), slot("p", "card-body"))),
    slot("span", "badge", { class: "badge" }),
  );
  return slots;
}

const previews = { light: buildPreview(document.getElementById("pv-light"), "light"), dark: buildPreview(document.getElementById("pv-dark"), "dark") };
const fontStack = (family) => (FAMILY.test(family ?? "") ? `"${family}", ui-sans-serif, system-ui, sans-serif` : "ui-sans-serif, system-ui, sans-serif");

function refreshPreview() {
  if (!kit) return;
  borderPainters.forEach((paint) => paint());
  for (const mode of ["light", "dark"]) {
    const box = document.getElementById(`pv-${mode}`);
    for (const colorId of PREVIEW_COLORS) {
      const value = find(colorId)?.[mode];
      if (HEX.test(value ?? "")) box.style.setProperty(`--p-${colorId}`, value);
      else box.style.removeProperty(`--p-${colorId}`);
    }
    const [display, displayLight, sans] = PREVIEW_FONTS.map(find);
    box.style.setProperty("--p-display", fontStack(display?.family));
    box.style.setProperty("--p-display-weight", String(display?.weight ?? 500));
    box.style.setProperty("--p-display-light", fontStack(displayLight?.family));
    box.style.setProperty("--p-display-light-weight", String(displayLight?.weight ?? 300));
    box.style.setProperty("--p-sans", fontStack(sans?.family));
    box.style.setProperty("--p-sans-weight", String(sans?.weight ?? 400));
    for (const borderId of ["border-thin", "border-thick"]) {
      const width = find(borderId)?.width;
      box.style.setProperty(`--p-${borderId}`, `${Number.isInteger(width) ? width : 1}px`);
    }
    for (const [key, node] of Object.entries(previews[mode])) {
      const text = (find(key)?.kind === "text" && find(key).value.trim()) || LOREM[key];
      if (key === "headline") {
        const words = text.split(/\s+/);
        const last = words.pop();
        node.replaceChildren(words.length ? `${words.join(" ")} ` : "", h("mark", {}, last));
      } else {
        node.textContent = text;
      }
    }
  }
  const extras = elements().filter((element) => element.kind === "color" && !PREVIEW_COLORS.includes(element.id));
  document.getElementById("extra-colors").replaceChildren(...extras.map((element) => h("span", {},
    h("span", { class: "swatch", style: HEX.test(element.light) ? `background: ${element.light}` : "", title: `${element.id} light` }),
    h("span", { class: "swatch", style: HEX.test(element.dark) ? `background: ${element.dark}` : "", title: `${element.id} dark` }),
    element.label || element.id)));
}

function renderPeople() {
  const list = document.getElementById("members");
  list.replaceChildren(...Object.entries(kit.members ?? {}).map(([email, memberRole]) => h("div", { class: "member" },
    h("span", { class: "avatar", "aria-hidden": "true" }, email[0].toUpperCase()),
    h("span", { class: "member-email" }, email),
    h("select", { class: "input", style: "width: auto; min-height: 40px", "aria-label": `Permission for ${email}`,
      onChange: async (event) => {
        try {
          await api("PUT", `/api/kits/${id}/members/${encodeURIComponent(email)}`, { role: event.target.value });
          kit.members[email] = event.target.value;
          setStatus(status, `${email} now has the permission "${ROLE_LABELS[event.target.value]}".`, "ok");
        } catch (error) {
          event.target.value = kit.members[email];
          setStatus(status, error.message, "error");
        }
      } },
    ["viewer", "editor"].map((value) => h("option", { value, selected: value === memberRole }, ROLE_LABELS[value]))),
    h("button", { type: "button", class: "icon-button", "aria-label": `Remove ${email}`, onClick: async () => {
      if (!window.confirm(`Remove ${email} from this kit?`)) return;
      try {
        await api("DELETE", `/api/kits/${id}/members/${encodeURIComponent(email)}`);
        delete kit.members[email];
        renderPeople();
        setStatus(status, `${email} is removed from this kit.`, "ok");
      } catch (error) { setStatus(status, error.message, "error"); }
    } }, "Remove"))));
}

document.getElementById("add-person").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("person-email");
  const personRole = document.getElementById("person-role").value;
  try {
    const added = await api("PUT", `/api/kits/${id}/members/${encodeURIComponent(email.value)}`, { role: personRole });
    kit.members = { ...kit.members, [added.email]: added.role };
    email.value = "";
    renderPeople();
    setStatus(status, `${added.email} is added. Also invite this person on launchd.eu/apps.`, "ok");
  } catch (error) {
    setStatus(status, error.data?.errors?.[0]?.message ?? error.message, "error");
  }
});

document.getElementById("add-section").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = document.getElementById("section-title");
  kit.sections.push({ id: uniqueId(title.value), title: title.value.trim(), elements: [] });
  title.value = "";
  render();
  changed();
});

notes.addEventListener("input", () => { kit.notes = notes.value; changed(); });

saveButton.addEventListener("click", async () => {
  document.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
  saveButton.disabled = true;
  setStatus(status, "Saving…");
  try {
    const saved = await api("PUT", `/api/kits/${id}`, { name: kit.name, notes: kit.notes, sections: kit.sections });
    Object.assign(kit, { updatedAt: saved.updatedAt, updatedBy: saved.updatedBy });
    dirty = false;
    document.getElementById("saved").textContent = `Saved ${formatSaved(kit)}`;
    setStatus(status, "Saved.", "ok");
  } catch (error) {
    const errors = error.data?.errors ?? [];
    if (!errors.length) return setStatus(status, error.message, "error");
    const inputs = errors.map(({ field }) => document.querySelector(`[data-field="${field}"]`)).filter(Boolean);
    inputs.forEach((input) => input.setAttribute("aria-invalid", "true"));
    inputs[0]?.focus();
    setStatus(status, `${errors.length === 1 ? "1 value breaks a rule" : `${errors.length} values break a rule`}. ${errors[0].message} Fix the values marked in red, then save again.`, "error");
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById("download-pdf").addEventListener("click", () => window.print());

document.getElementById("download-data").addEventListener("click", () => {
  if (dirty) return setStatus(status, "Save your changes first. The download has only the saved values.", "error");
  download(`/api/kits/${id}/export`, `${slug(kit.name, "kit")}-ui-kit.json`).catch((error) => setStatus(status, error.message, "error"));
});

document.getElementById("delete-kit").addEventListener("click", async () => {
  if (!window.confirm(`Delete the kit of ${kit.name}? You cannot undo this.`)) return;
  try {
    await api("DELETE", `/api/kits/${id}`);
    dirty = false;
    window.location.href = "/";
  } catch (error) { setStatus(status, error.message, "error"); }
});

window.addEventListener("beforeunload", (event) => { if (dirty) event.preventDefault(); });

try {
  const [me, loaded] = await Promise.all([api("GET", "/api/me"), api("GET", `/api/kits/${id}`)]);
  kit = loaded;
  role = kit.role;
  renderTopbar(me, role);
  document.title = `${kit.name} · UI Kit`;
  document.getElementById("kit-name").textContent = kit.name;
  document.getElementById("saved").textContent = kit.updatedAt ? `Saved ${formatSaved(kit)}` : "Not saved yet";
  notes.value = kit.notes ?? "";
  notes.disabled = !canEdit();
  saveButton.hidden = !canEdit();
  document.getElementById("add-section").hidden = !canEdit();
  document.getElementById("viewer-notice").hidden = canEdit();
  document.getElementById("people").hidden = role !== "owner";
  document.getElementById("danger").hidden = role !== "owner";
  if (role === "owner") renderPeople();
  render();
} catch (error) {
  document.getElementById("kit-name").textContent = error.status === 404 ? "Kit not found" : "Something went wrong";
  setStatus(status, error.message, "error");
}
