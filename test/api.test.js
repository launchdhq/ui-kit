import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../server.js";

const OWNER = "owner@studio.com";
const EDITOR = "ana@designer.co";
const VIEWER = "jo@client.com";
const STRANGER = "someone@else.com";

let server, base, dataDir, kitId, otherKitId;

async function call(method, path, email, body) {
  const headers = email ? { "X-Launchd-Email": email } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, { method, headers, body: typeof body === "string" ? body : body && JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "ui-kit-"));
  server = createServer({ dataDir, ownerEmail: "Owner@Studio.com" });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
  kitId = (await call("POST", "/api/kits", OWNER, { name: "Launchd" })).body.id;
  otherKitId = (await call("POST", "/api/kits", OWNER, { name: "Acme" })).body.id;
  await call("PUT", `/api/kits/${kitId}/members/${EDITOR}`, OWNER, { role: "editor" });
  await call("PUT", `/api/kits/${kitId}/members/${VIEWER}`, OWNER, { role: "viewer" });
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

test("a request with no email gets 401", async () => {
  assert.equal((await call("GET", "/api/kits")).status, 401);
  assert.equal((await call("GET", `/api/kits/${kitId}`)).status, 401);
});

test("the kit list shows each person only the kits they can read", async () => {
  const names = async (email) => (await call("GET", "/api/kits", email)).body.map((kit) => kit.name).sort();
  assert.deepEqual(await names(OWNER), ["Acme", "Launchd"]);
  assert.deepEqual(await names(EDITOR), ["Launchd"]);
  assert.deepEqual(await names(VIEWER), ["Launchd"]);
  assert.deepEqual(await names(STRANGER), []);
});

test("the kit list shows the members only to the owner", async () => {
  const [ownerRow] = (await call("GET", "/api/kits", OWNER)).body.filter((kit) => kit.id === kitId);
  assert.deepEqual(ownerRow.members, { [EDITOR]: "editor", [VIEWER]: "viewer" });
  assert.equal(ownerRow.role, "owner");
  const [viewerRow] = (await call("GET", "/api/kits", VIEWER)).body;
  assert.equal(viewerRow.members, undefined);
  assert.equal(viewerRow.role, "viewer");
});

test("only the owner adds a kit", async () => {
  assert.equal((await call("POST", "/api/kits", OWNER, { name: "Northwind" })).status, 201);
  for (const email of [EDITOR, VIEWER, STRANGER]) {
    assert.equal((await call("POST", "/api/kits", email, { name: "Northwind" })).status, 403, email);
  }
});

test("a new kit starts with the default sections", async () => {
  const { body } = await call("GET", `/api/kits/${kitId}`, OWNER);
  assert.equal(body.sections[0].elements[0].id, "canvas");
});

test("a kit with no name is refused", async () => {
  const { status, body } = await call("POST", "/api/kits", OWNER, { name: "" });
  assert.equal(status, 422);
  assert.deepEqual(body.errors.map((error) => error.field), ["name"]);
});

test("members and the owner read a kit, with their role", async () => {
  for (const [email, role] of [[OWNER, "owner"], [EDITOR, "editor"], [VIEWER, "viewer"]]) {
    const { status, body } = await call("GET", `/api/kits/${kitId}`, email);
    assert.equal(status, 200, email);
    assert.equal(body.role, role);
  }
});

test("a person who is not a member gets 404 for the kit", async () => {
  assert.equal((await call("GET", `/api/kits/${kitId}`, STRANGER)).status, 404);
  assert.equal((await call("GET", `/api/kits/${otherKitId}`, EDITOR)).status, 404);
});

test("a kit id that is not a UUID gets 404", async () => {
  assert.equal((await call("GET", "/api/kits/..%2F..%2Fetc%2Fpasswd", OWNER)).status, 404);
  assert.equal((await call("GET", "/api/kits/00000000-0000-4000-8000-000000000000", OWNER)).status, 404);
});

test("the export of a kit holds the values and not the members", async () => {
  for (const email of [OWNER, EDITOR, VIEWER]) {
    const { status, body } = await call("GET", `/api/kits/${kitId}/export`, email);
    assert.equal(status, 200, email);
    assert.deepEqual(Object.keys(body).sort(), ["name", "notes", "sections", "updatedAt", "version"]);
  }
  assert.equal((await call("GET", `/api/kits/${kitId}/export`, STRANGER)).status, 404);
});

test("the export of all kits holds each kit that the person can read", async () => {
  assert.deepEqual((await call("GET", "/api/export", OWNER)).body.map((kit) => kit.name).sort(), ["Acme", "Launchd"]);
  assert.deepEqual((await call("GET", "/api/export", VIEWER)).body.map((kit) => kit.name), ["Launchd"]);
  assert.deepEqual((await call("GET", "/api/export", STRANGER)).body, []);
  assert.equal((await call("GET", "/api/export", OWNER)).body[0].members, undefined);
});

test("the owner and an editor save a kit", async () => {
  for (const email of [OWNER, EDITOR]) {
    const kit = (await call("GET", `/api/kits/${kitId}`, email)).body;
    kit.sections[0].elements[0].light = "#ffffff";
    kit.notes = `Saved by ${email}`;
    assert.equal((await call("PUT", `/api/kits/${kitId}`, email, kit)).status, 200, email);
    const saved = (await call("GET", `/api/kits/${kitId}`, VIEWER)).body;
    assert.equal(saved.notes, `Saved by ${email}`);
    assert.equal(saved.sections[0].elements[0].light, "#ffffff");
    assert.equal(saved.updatedBy, email);
  }
});

test("a viewer cannot save a kit, and a stranger gets 404", async () => {
  const kit = (await call("GET", `/api/kits/${kitId}`, VIEWER)).body;
  assert.equal((await call("PUT", `/api/kits/${kitId}`, VIEWER, kit)).status, 403);
  assert.equal((await call("PUT", `/api/kits/${kitId}`, STRANGER, kit)).status, 404);
});

test("a save cannot change the members", async () => {
  const kit = (await call("GET", `/api/kits/${kitId}`, EDITOR)).body;
  await call("PUT", `/api/kits/${kitId}`, EDITOR, { ...kit, members: { [EDITOR]: "editor", [STRANGER]: "editor" } });
  assert.equal((await call("GET", `/api/kits/${kitId}`, STRANGER)).status, 404);
});

test("a save with a value that breaks a rule gets 422 and the bad fields", async () => {
  const kit = (await call("GET", `/api/kits/${kitId}`, EDITOR)).body;
  kit.sections[0].elements[0].light = "white";
  const { status, body } = await call("PUT", `/api/kits/${kitId}`, EDITOR, kit);
  assert.equal(status, 422);
  assert.deepEqual(body.errors.map((error) => error.field), ["sections.0.elements.0.light"]);
});

test("a body that is not JSON gets 400", async () => {
  assert.equal((await call("PUT", `/api/kits/${kitId}`, EDITOR, "{not json")).status, 400);
});

test("a saved kit is one file with a version number", async () => {
  assert.deepEqual((await readdir(join(dataDir, "kits"))).sort(), [`${kitId}.json`, `${otherKitId}.json`].sort());
  const file = JSON.parse(await readFile(join(dataDir, "kits", `${kitId}.json`), "utf8"));
  assert.equal(file.version, 1);
  assert.deepEqual(file.members, { [EDITOR]: "editor", [VIEWER]: "viewer" });
});

test("only the owner deletes a kit", async () => {
  for (const email of [EDITOR, VIEWER]) assert.equal((await call("DELETE", `/api/kits/${kitId}`, email)).status, 403, email);
  assert.equal((await call("DELETE", `/api/kits/${kitId}`, STRANGER)).status, 404);
  assert.equal((await call("DELETE", `/api/kits/${kitId}`, OWNER)).status, 204);
  assert.deepEqual(await readdir(join(dataDir, "kits")), [`${otherKitId}.json`]);
});

test("only the owner changes the members", async () => {
  const path = `/api/kits/${kitId}/members/${STRANGER}`;
  for (const email of [EDITOR, VIEWER]) {
    assert.equal((await call("PUT", path, email, { role: "editor" })).status, 403, email);
    assert.equal((await call("DELETE", `/api/kits/${kitId}/members/${VIEWER}`, email)).status, 403, email);
  }
  assert.equal((await call("PUT", path, STRANGER, { role: "editor" })).status, 404);
  assert.equal((await call("PUT", path, OWNER, { role: "editor" })).status, 200);
  assert.equal((await call("GET", `/api/kits/${kitId}`, STRANGER)).body.role, "editor");
});

test("the owner removes a member", async () => {
  assert.equal((await call("DELETE", `/api/kits/${kitId}/members/${VIEWER}`, OWNER)).status, 204);
  assert.equal((await call("GET", `/api/kits/${kitId}`, VIEWER)).status, 404);
});

test("a member role must be editor or viewer", async () => {
  const { status } = await call("PUT", `/api/kits/${kitId}/members/${STRANGER}`, OWNER, { role: "owner" });
  assert.equal(status, 422);
});

test("a member email must look like an email", async () => {
  assert.equal((await call("PUT", `/api/kits/${kitId}/members/not-an-email`, OWNER, { role: "viewer" })).status, 422);
});

test("a member that the owner removes during a save stays removed", async () => {
  const kit = (await call("GET", `/api/kits/${kitId}`, EDITOR)).body;
  for (let round = 0; round < 20; round++) {
    await call("PUT", `/api/kits/${kitId}/members/${VIEWER}`, OWNER, { role: "viewer" });
    await Promise.all([
      call("PUT", `/api/kits/${kitId}`, EDITOR, kit),
      call("DELETE", `/api/kits/${kitId}/members/${VIEWER}`, OWNER),
    ]);
    assert.equal((await call("GET", `/api/kits/${kitId}`, VIEWER)).status, 404, `round ${round}`);
  }
});

test("the save response shows the members only to the owner", async () => {
  const kit = (await call("GET", `/api/kits/${kitId}`, EDITOR)).body;
  const editorSave = await call("PUT", `/api/kits/${kitId}`, EDITOR, kit);
  assert.equal(editorSave.body.members, undefined);
  assert.equal(editorSave.body.role, "editor");
  const ownerSave = await call("PUT", `/api/kits/${kitId}`, OWNER, kit);
  assert.deepEqual(ownerSave.body.members, { [EDITOR]: "editor", [VIEWER]: "viewer" });
});

test("a file in the kits folder that is not a kit does not break the list", async () => {
  await writeFile(join(dataDir, "kits", "backup.json"), "{}");
  assert.equal((await call("GET", "/api/kits", OWNER)).status, 200);
  assert.equal((await call("GET", "/api/export", OWNER)).status, 200);
});

test("a URL with a bad escape gets 404", async () => {
  assert.equal((await call("GET", "/api/kits/%E0%A4%A", OWNER)).status, 404);
  assert.equal((await call("DELETE", `/api/kits/${kitId}/members/%ZZ`, OWNER)).status, 404);
});

test("a character split across two parts of the body is kept", async () => {
  const kit = (await call("GET", `/api/kits/${kitId}`, EDITOR)).body;
  const body = Buffer.from(JSON.stringify({ ...kit, notes: "Designer’s note" }));
  const split = body.indexOf(Buffer.from("’")) + 1;
  const status = await new Promise((resolve, reject) => {
    const request = http.request(`${base}/api/kits/${kitId}`, { method: "PUT", headers: { "X-Launchd-Email": EDITOR, "Content-Type": "application/json" } },
      (response) => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
    request.on("error", reject);
    request.write(body.subarray(0, split));
    setTimeout(() => request.end(body.subarray(split)), 50);
  });
  assert.equal(status, 200);
  assert.equal((await call("GET", `/api/kits/${kitId}`, VIEWER)).body.notes, "Designer’s note");
});

test("a body over 1 MB gets 413, even when it has fewer than a million characters", async () => {
  const notes = "’".repeat(400_000);
  assert.equal((await call("PUT", `/api/kits/${kitId}`, EDITOR, { notes })).status, 413);
});

test("emails match in any case", async () => {
  await call("PUT", `/api/kits/${kitId}/members/Mixed@Client.COM`, OWNER, { role: "viewer" });
  assert.equal((await call("GET", `/api/kits/${kitId}`, "mixed@client.com")).body.role, "viewer");
  assert.equal((await call("GET", `/api/kits/${kitId}`, "OWNER@studio.com")).body.role, "owner");
});
