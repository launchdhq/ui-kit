import { HEX } from "/kit.js";
import { ROLE_LABELS, api, download, formatSaved, h, renderTopbar, setStatus, slug } from "/ui.js";

const status = document.getElementById("status");
const list = document.getElementById("clients");
const form = document.getElementById("add-client");

function people(kit) {
  if (kit.role !== "owner") return `You: ${ROLE_LABELS[kit.role]}`;
  const entries = Object.entries(kit.members ?? {});
  if (!entries.length) return "No people yet";
  return entries.map(([email, role]) => `${email} (${ROLE_LABELS[role]})`).join(", ");
}

function row(kit) {
  return h("tr", {},
    h("td", {}, h("span", { class: "client-name" }, kit.name)),
    h("td", {}, h("span", { class: "swatches" },
      kit.colors.filter((color) => HEX.test(color)).map((color) => h("span", { class: "swatch", style: `background: ${color}`, title: color })))),
    h("td", { class: "small muted" }, people(kit)),
    h("td", { class: "small muted" }, formatSaved(kit)),
    h("td", {}, h("span", { class: "row-actions" },
      h("button", { type: "button", class: "button", "aria-label": `Download ${kit.name} data`,
        onClick: () => download(`/api/kits/${kit.id}/export`, `${slug(kit.name, "kit")}-ui-kit.json`)
          .catch((error) => setStatus(status, error.message, "error")) }, "Download data"),
      h("a", { href: `/kits/${kit.id}`, "aria-label": `Open ${kit.name}` }, "Open"))),
  );
}

async function load() {
  const kits = await api("GET", "/api/kits");
  list.replaceChildren(...(kits.length ? kits.map(row)
    : [h("tr", {}, h("td", { colSpan: 5, class: "empty" },
      form.hidden ? "You have no kits yet. Ask the owner of this app to invite you." : "Add your first client above."))]));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("client-name");
  try {
    const kit = await api("POST", "/api/kits", { name: input.value });
    window.location.href = `/kits/${kit.id}`;
  } catch (error) {
    setStatus(status, error.data?.errors?.[0]?.message ?? error.message, "error");
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }
});

document.getElementById("download-all").addEventListener("click", () =>
  download("/api/export", "ui-kits.json").catch((error) => setStatus(status, error.message, "error")));

try {
  const me = await api("GET", "/api/me");
  renderTopbar(me);
  form.hidden = !me.owner;
  await load();
} catch (error) {
  setStatus(status, error.message, "error");
}
