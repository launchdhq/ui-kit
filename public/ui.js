export const ROLE_LABELS = { owner: "Owner", editor: "Can edit", viewer: "Can view" };

export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === "class") element.className = value;
    else if (key === "style") element.style.cssText = value;
    else if (key.startsWith("on")) element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in element && !key.includes("-")) element[key] = value;
    else if (value !== false) element.setAttribute(key, value === true ? "" : value);
  }
  element.append(...children.flat().filter((child) => child !== undefined && child !== null && child !== false));
  return element;
}

export async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.error ?? "The server had a problem. Try again."), { status: response.status, data });
  return data;
}

export function renderTopbar(me, role = me.owner ? "owner" : undefined) {
  document.getElementById("who").replaceChildren(h("span", {}, me.email), role && h("span", { class: "pill" }, ROLE_LABELS[role]));
}

export function setStatus(element, text, kind = "") {
  element.textContent = text;
  element.className = `status ${kind}`;
}

export function slug(text, fallback) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36).replace(/-$/, "") || fallback;
}

export async function download(path, name) {
  saveFile(JSON.stringify(await api("GET", path), null, 2), name, "application/json");
}

export function saveFile(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = h("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatSaved(kit) {
  if (!kit.updatedAt) return "Not saved yet";
  const when = new Date(kit.updatedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return kit.updatedBy ? `${when}, by ${kit.updatedBy}` : when;
}
