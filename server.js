import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { VERSION, defaultKit, cleanKit } from "./kit.js";
import packageJson from "./package.json" with { type: "json" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const ROLES = ["editor", "viewer"];
const MAX_BODY = 1_000_000;
const KIT_PAGE = /^\/kits\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILES = {
  "/": "public/index.html",
  "/app.css": "public/app.css",
  "/ui.js": "public/ui.js",
  "/index.js": "public/index.js",
  "/kit-page.js": "public/kit-page.js",
  "/kit.js": "kit.js",
};
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

class HttpError extends Error {
  constructor(status, body) {
    super(String(status));
    this.status = status;
    this.body = body;
  }
}

const normalize = (email) => (email ?? "").trim().toLowerCase();

export function createServer({ dataDir, ownerEmail }) {
  const kitsDir = join(dataDir, "kits");
  const owner = normalize(ownerEmail);
  const ready = mkdir(kitsDir, { recursive: true });

  const kitPath = (id) => join(kitsDir, `${id}.json`);
  const roleOf = (kit, email) => (owner && email === owner ? "owner" : Object.hasOwn(kit.members, email) && kit.members[email]);
  const exported = ({ version, name, notes, labels = [], sections, updatedAt }) => ({ version, name, notes, labels, sections, updatedAt });

  async function load(id) {
    if (!UUID.test(id)) return;
    try { return JSON.parse(await readFile(kitPath(id), "utf8")); } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
  }

  async function store(id, kit) {
    const temporary = `${kitPath(id)}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(kit, null, 2));
    await rename(temporary, kitPath(id));
  }

  async function readable(email) {
    const ids = (await readdir(kitsDir)).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5));
    const kits = await Promise.all(ids.map(async (id) => {
      const kit = await load(id);
      return kit?.members && { id, ...kit };
    }));
    return kits.filter((kit) => kit && roleOf(kit, email)).sort((a, b) => a.name.localeCompare(b.name));
  }

  const queues = new Map();
  function oneAtATime(id, action) {
    const run = (queues.get(id) ?? Promise.resolve()).then(action);
    const done = run.catch(() => {});
    queues.set(id, done);
    done.then(() => queues.get(id) === done && queues.delete(id));
    return run;
  }

  function view(id, kit, role) {
    const { members, ...rest } = kit;
    return { id, ...rest, role, ...(role === "owner" && { members }) };
  }

  async function kitFor(id, email, allowed) {
    const kit = await load(id);
    const role = kit && roleOf(kit, email);
    if (!role) throw new HttpError(404, { error: "This kit does not exist, or you cannot open it." });
    if (!allowed.includes(role)) throw new HttpError(403, { error: "You do not have permission to do this." });
    return { kit, role };
  }

  function stamp(kit, email) {
    return { ...kit, updatedAt: new Date().toISOString(), updatedBy: email };
  }

  function validated(input) {
    const { kit, errors } = cleanKit(input);
    if (errors.length) throw new HttpError(422, { errors });
    return kit;
  }

  const routes = [
    ["GET", /^\/api\/me$/, async ({ email }) => ({ email, owner: email === owner, version: packageJson.version })],
    ["GET", /^\/api\/kits$/, async ({ email }) => (await readable(email)).map((kit) => {
      const role = roleOf(kit, email);
      const colors = kit.sections.flatMap((section) => section.elements).filter((element) => element.kind === "color");
      return { id: kit.id, name: kit.name, updatedAt: kit.updatedAt, updatedBy: kit.updatedBy, role,
        colors: colors.slice(0, 4).map((element) => element.light),
        ...(role === "owner" && { members: kit.members }) };
    })],
    ["POST", /^\/api\/kits$/, async ({ email, body }) => {
      if (email !== owner) throw new HttpError(403, { error: "Only the owner can add a kit." });
      const id = randomUUID();
      const kit = { version: VERSION, ...stamp(validated(defaultKit(body?.name)), email), members: {} };
      await store(id, kit);
      return [201, { id, ...kit }];
    }],
    ["GET", /^\/api\/export$/, async ({ email }) => (await readable(email)).map(exported)],
    ["GET", /^\/api\/kits\/([^/]+)$/, async ({ email, params: [id] }) => {
      const { kit, role } = await kitFor(id, email, ["owner", "editor", "viewer"]);
      return view(id, kit, role);
    }],
    ["GET", /^\/api\/kits\/([^/]+)\/export$/, async ({ email, params: [id] }) =>
      exported((await kitFor(id, email, ["owner", "editor", "viewer"])).kit)],
    ["PUT", /^\/api\/kits\/([^/]+)$/, ({ email, body, params: [id] }) => oneAtATime(id, async () => {
      const { kit, role } = await kitFor(id, email, ["owner", "editor"]);
      const saved = { version: VERSION, ...stamp(validated(body), email), members: kit.members };
      await store(id, saved);
      return view(id, saved, role);
    })],
    ["DELETE", /^\/api\/kits\/([^/]+)$/, ({ email, params: [id] }) => oneAtATime(id, async () => {
      await kitFor(id, email, ["owner"]);
      await rm(kitPath(id));
      return [204];
    })],
    ["PUT", /^\/api\/kits\/([^/]+)\/members\/([^/]+)$/, ({ email, body, params: [id, member] }) => oneAtATime(id, async () => {
      const { kit } = await kitFor(id, email, ["owner"]);
      const memberEmail = normalize(member);
      if (!EMAIL.test(memberEmail)) throw new HttpError(422, { errors: [{ field: "email", message: "Write a valid email address." }] });
      if (!ROLES.includes(body?.role)) throw new HttpError(422, { errors: [{ field: "role", message: "Use editor or viewer." }] });
      await store(id, { ...kit, members: { ...kit.members, [memberEmail]: body.role } });
      return { email: memberEmail, role: body.role };
    })],
    ["DELETE", /^\/api\/kits\/([^/]+)\/members\/([^/]+)$/, ({ email, params: [id, member] }) => oneAtATime(id, async () => {
      const { kit } = await kitFor(id, email, ["owner"]);
      const { [normalize(member)]: _removed, ...members } = kit.members;
      await store(id, { ...kit, members });
      return [204];
    })],
  ];

  async function readBody(request) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes <= MAX_BODY) chunks.push(chunk);
    }
    if (bytes > MAX_BODY) throw new HttpError(413, { error: "The request is too large." });
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text) return undefined;
    try { return JSON.parse(text); } catch { throw new HttpError(400, { error: "The request body is not valid JSON." }); }
  }

  async function handle(request) {
    await ready;
    const path = new URL(request.url, "http://localhost").pathname;
    const file = request.method === "GET" && (FILES[path] ?? (KIT_PAGE.test(path) && "public/kit.html"));
    if (file) return [200, await readFile(join(import.meta.dirname, file)), TYPES[extname(file)]];
    for (const [method, pattern, action] of routes) {
      const match = request.method === method && path.match(pattern);
      if (!match) continue;
      const email = normalize(request.headers["x-launchd-email"]);
      if (!email) throw new HttpError(401, { error: "Sign in to Launchd to use this app." });
      let params;
      try { params = match.slice(1).map(decodeURIComponent); } catch { throw new HttpError(404, { error: "This page does not exist." }); }
      const result = await action({ email, params, body: await readBody(request) });
      return Array.isArray(result) && typeof result[0] === "number" ? result : [200, result];
    }
    throw new HttpError(404, { error: "This page does not exist." });
  }

  return http.createServer(async (request, response) => {
    let status, body, type;
    try {
      [status, body, type] = await handle(request);
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error);
      [status, body] = error instanceof HttpError ? [error.status, error.body] : [500, { error: "The server had a problem. Try again." }];
    }
    if (type) {
      response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache" });
      return response.end(body);
    }
    response.writeHead(status, body === undefined ? {} : { "Content-Type": "application/json" });
    response.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  createServer({ dataDir: process.env.DATA_DIR ?? "./data", ownerEmail: process.env.OWNER_EMAIL })
    .listen(port, () => console.log(`ui-kit on http://localhost:${port}`));
}
