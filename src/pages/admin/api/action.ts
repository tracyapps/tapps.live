import type { APIRoute } from "astro";
import { getDB, setKv, getKv } from "../../../lib/db";
import { checkCsrf } from "../../../lib/auth";
import { refreshFeed, testFeed, refreshAllEnabled } from "../../../feeds/runner";
import { feedById } from "../../../feeds/registry";

// One dispatch endpoint for every admin mutation. Forms POST here with an
// `op` + `csrf` + `back`; we act, then redirect back (PRG). Feed ops accept
// fetch() too and return JSON for the status console's live buttons.

type Json = Record<string, unknown>;

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};
const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function parseRoadmapField(v: FormDataEntryValue | null): { label: string; pct: number }[] {
  return String(v ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // "Label | 83" or just "Label" (no bar then)
      const m = line.match(/^(.+?)\s*\|\s*(\d{1,3})$/);
      return m ? { label: m[1], pct: Math.min(100, parseInt(m[2], 10)) } : { label: line, pct: 0 };
    });
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  let op = "";
  let back = "/admin";
  let fields: Record<string, FormDataEntryValue> = {};

  if (isJson) {
    const body = (await request.json().catch(() => ({}))) as Json;
    op = String(body.op ?? "");
    back = String(body.back ?? back);
    for (const [k, v] of Object.entries(body)) fields[k] = String(v) as FormDataEntryValue;
  } else {
    const form = await request.formData().catch(() => null);
    if (!form) return new Response("Bad request", { status: 400 });
    op = str(form.get("op"));
    back = str(form.get("back")) || "/admin";
    for (const [k, v] of form.entries()) fields[k] = v;
  }

  if (!checkCsrf(String(fields.csrf ?? ""))) {
    return new Response("Bad CSRF token — reload the admin page and try again", { status: 403 });
  }

  const db = getDB();
  const respond = (msg: string, params?: Record<string, string>) => {
    const suffix = params ? "&" + new URLSearchParams(params).toString() : "";
    return redirect(`${back}?flash=${encodeURIComponent(msg)}${suffix}`, 302);
  };
  const respondJson = (ok: boolean, message: string, data?: Json) =>
    new Response(JSON.stringify({ ok, message, ...data }), {
      headers: { "content-type": "application/json" }
    });

  try {
    switch (op) {
      // ── settings / content ─────────────────────────────────────────
      case "save-profile": {
        const profile = getKv<Record<string, string>>("profile", {});
        for (const key of ["name", "handle", "role", "location", "eyebrow", "blurb", "shortBlurb", "email", "phone", "calendly", "sticker"]) {
          if (fields[key] != null) profile[key] = str(fields[key]);
        }
        setKv("profile", profile);
        return respond("profile saved");
      }
      case "save-page-content": {
        const page = str(fields.page);
        const key = `page:${page}`;
        const content = getKv<Record<string, unknown>>(key, {});
        const prefix = `c_`;
        for (const [k, v] of Object.entries(fields)) {
          if (!k.startsWith(prefix)) continue;
          content[k.slice(prefix.length)] = String(v);
        }
        // multi-line fields (bio, slots) arrive as newline text
        if (fields.bio) content.bio = str(fields.bio).split("\n\n").map((s) => s.trim()).filter(Boolean);
        if (fields.skills) content.skills = list(fields.skills);
        if (fields.slots) {
          content.slots = str(fields.slots)
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [day, time, note] = line.split("|").map((s) => s.trim());
              return { day: day || "—", time: time || "—", note: note || "open" };
            });
        }
        setKv(key, content);
        return respond(`content saved for /${page}`);
      }

      // ── projects ───────────────────────────────────────────────────
      case "save-project": {
        const id = num(fields.id);
        const slug = str(fields.slug).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        const values = {
          slug,
          name: str(fields.name) || slug,
          tagline: str(fields.tagline),
          url: str(fields.url),
          repo: str(fields.repo),
          roadmap_path: str(fields.roadmap_path) || "ROADMAP.md",
          status: str(fields.status) || "live",
          status_label: str(fields.status_label),
          since: str(fields.since),
          fill: str(fields.fill),
          progress: str(fields.progress) === "" ? null : Math.max(0, Math.min(100, num(fields.progress) ?? 0)),
          stack: JSON.stringify(list(fields.stack)),
          tags: JSON.stringify(list(fields.tags)),
          roadmap: JSON.stringify(parseRoadmapField(fields.roadmap)),
          sort: num(fields.sort) ?? 99,
          updated_at: new Date().toISOString()
        };
        if (!slug) return respond("slug required — nothing saved", undefined);
        if (id) {
          db.prepare(
            `UPDATE projects SET slug=@slug, name=@name, tagline=@tagline, url=@url, repo=@repo, roadmap_path=@roadmap_path,
             status=@status, status_label=@status_label, since=@since, fill=@fill, progress=@progress, stack=@stack,
             tags=@tags, roadmap=@roadmap, sort=@sort, updated_at=@updated_at WHERE id=@id`
          ).run({ ...values, id });
        } else {
          db.prepare(
            `INSERT INTO projects (slug, name, tagline, url, repo, roadmap_path, status, status_label, since, fill, progress, stack, tags, roadmap, sort, updated_at)
             VALUES (@slug, @name, @tagline, @url, @repo, @roadmap_path, @status, @status_label, @since, @fill, @progress, @stack, @tags, @roadmap, @sort, @updated_at)`
          ).run(values);
        }
        return respond(id ? `project “${values.name}” updated` : `project “${values.name}” created`);
      }
      case "delete-project": {
        db.prepare("DELETE FROM projects WHERE id = ?").run(num(fields.id));
        return respond("project deleted");
      }
      case "move-project": {
        const id = num(fields.id);
        const dir = str(fields.dir) === "up" ? -1 : 1;
        const row = db.prepare("SELECT sort FROM projects WHERE id = ?").get(id) as { sort: number } | undefined;
        if (row) db.prepare("UPDATE projects SET sort = ? WHERE id = ?").run(row.sort + dir * 1.5, id);
        normalizeSort("projects");
        return respond("order updated");
      }

      // ── links ──────────────────────────────────────────────────────
      case "save-link": {
        const id = num(fields.id);
        const values = {
          kind: str(fields.kind) || "social",
          name: str(fields.name),
          handle: str(fields.handle),
          url: str(fields.url),
          fill: str(fields.fill),
          note: str(fields.note),
          screenshot_id: str(fields.screenshot_id) ? num(fields.screenshot_id) : null,
          visible: fields.visible ? 1 : 0,
          sort: num(fields.sort) ?? 99
        };
        if (!values.name || !values.url) return respond("name and url required — nothing saved");
        if (id) {
          db.prepare(
            `UPDATE links SET kind=@kind, name=@name, handle=@handle, url=@url, fill=@fill, note=@note,
             screenshot_id=@screenshot_id, visible=@visible, sort=@sort WHERE id=@id`
          ).run({ ...values, id });
        } else {
          db.prepare(
            `INSERT INTO links (kind, name, handle, url, fill, note, screenshot_id, visible, sort)
             VALUES (@kind, @name, @handle, @url, @fill, @note, @screenshot_id, @visible, @sort)`
          ).run(values);
        }
        return respond(id ? `link “${values.name}” updated` : `link “${values.name}” added`);
      }
      case "delete-link": {
        db.prepare("DELETE FROM links WHERE id = ?").run(num(fields.id));
        return respond("link deleted");
      }
      case "move-link": {
        const id = num(fields.id);
        const dir = str(fields.dir) === "up" ? -1 : 1;
        const row = db.prepare("SELECT sort, kind FROM links WHERE id = ?").get(id) as { sort: number } | undefined;
        if (row) db.prepare("UPDATE links SET sort = ? WHERE id = ?").run(row.sort + dir * 1.5, id);
        normalizeSort("links");
        return respond("order updated");
      }
      case "upload-media": {
        const file = fields.file;
        if (!(file instanceof File) || !file.size) return respond("no file received");
        if (file.size > 4 * 1024 * 1024) return respond("file too large — 4MB max");
        if (!/^image\//.test(file.type)) return respond("images only for now");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = db
          .prepare("INSERT INTO media (name, mime, bytes) VALUES (?, ?, ?)")
          .run(file.name || "upload", file.type, bytes);
        const mediaId = Number(info.lastInsertRowid);
        const attach = str(fields.attach);
        if (attach === "portfolio" && num(fields.link_id)) {
          db.prepare("UPDATE links SET screenshot_id = ? WHERE id = ?").run(mediaId, num(fields.link_id));
        }
        return respond(`uploaded “${file.name}” · media id ${mediaId}`);
      }

      // ── nav ────────────────────────────────────────────────────────
      case "save-nav": {
        const id = num(fields.id);
        if (id) {
          db.prepare("UPDATE nav_items SET label = ?, href = ?, visible = ?, external = ? WHERE id = ?").run(
            str(fields.label),
            str(fields.href),
            fields.visible ? 1 : 0,
            fields.external ? 1 : 0,
            id
          );
        } else {
          db.prepare("INSERT INTO nav_items (label, href, sort, visible, external) VALUES (?, ?, ?, 1, ?)").run(
            str(fields.label),
            str(fields.href),
            num(fields.sort) ?? 99,
            fields.external ? 1 : 0
          );
        }
        return respond("nav updated");
      }
      case "delete-nav": {
        db.prepare("DELETE FROM nav_items WHERE id = ?").run(num(fields.id));
        return respond("nav item removed");
      }
      case "move-nav": {
        const id = num(fields.id);
        const dir = str(fields.dir) === "up" ? -1 : 1;
        const row = db.prepare("SELECT sort FROM nav_items WHERE id = ?").get(id) as { sort: number } | undefined;
        if (row) db.prepare("UPDATE nav_items SET sort = ? WHERE id = ?").run(row.sort + dir * 1.5, id);
        normalizeSort("nav_items");
        return respond("nav order updated");
      }

      // ── custom pages ───────────────────────────────────────────────
      case "save-page": {
        const id = num(fields.id);
        const slug = str(fields.slug).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        if (!slug || RESERVED_SLUGS.has(slug)) return respond(`slug “${slug || "?"}” is reserved — pick another`);
        const blocks: Json[] = [];
        const blockTypes = String(fields.block_types ?? "").split(",").filter(Boolean);
        for (const type of blockTypes) {
          const i = blocks.length;
          const get = (k: string) => str(fields[`b${i}_${k}`]);
          if (type === "heading") blocks.push({ type, text: get("text") });
          else if (type === "text") blocks.push({ type, text: get("text") });
          else if (type === "image") blocks.push({ type, src: get("src"), alt: get("alt"), ratio: get("ratio") || "16 / 9" });
          else if (type === "cta") blocks.push({ type, eyebrow: get("eyebrow"), title: get("title"), body: get("body"), url: get("url"), label: get("label") });
          else if (type === "links") {
            const items = get("items").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
              const [label, url, note] = line.split("|").map((s) => s.trim());
              return { label: label || url, url: url || "#", note: note || "" };
            });
            blocks.push({ type, items });
          } else if (type === "ticker") {
            const parts = get("parts").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
              const [name, note] = line.split("|").map((s) => s.trim());
              return { name: name || "—", note: note || "" };
            });
            blocks.push({ type, parts });
          }
        }
        const values = {
          slug,
          title: str(fields.title) || slug,
          kicker: str(fields.kicker),
          intro: str(fields.intro),
          blocks: JSON.stringify(blocks),
          published: fields.published ? 1 : 0,
          sort: num(fields.sort) ?? 0,
          updated_at: new Date().toISOString()
        };
        if (id) {
          db.prepare(
            `UPDATE pages SET slug=@slug, title=@title, kicker=@kicker, intro=@intro, blocks=@blocks, published=@published, sort=@sort, updated_at=@updated_at WHERE id=@id`
          ).run({ ...values, id });
        } else {
          db.prepare(
            `INSERT INTO pages (slug, title, kicker, intro, blocks, published, sort, updated_at)
             VALUES (@slug, @title, @kicker, @intro, @blocks, @published, @sort, @updated_at)`
          ).run(values);
        }
        return redirect(`/admin/content?flash=${encodeURIComponent(`page “/${slug}” saved`)}`, 302);
      }
      case "delete-page": {
        db.prepare("DELETE FROM pages WHERE id = ?").run(num(fields.id));
        return respond("page deleted");
      }

      // ── feeds ──────────────────────────────────────────────────────
      case "toggle-feed": {
        const id = str(fields.id);
        const row = db.prepare("SELECT enabled FROM feeds WHERE id = ?").get(id) as { enabled: number } | undefined;
        db.prepare("UPDATE feeds SET enabled = ? WHERE id = ?").run(row?.enabled ? 0 : 1, id);
        return respondJsonOrRedirect(row?.enabled ? `${id} switched off` : `${id} switched on — first refresh lands shortly`);
      }
      case "save-feed-config": {
        const id = str(fields.id);
        const feed = feedById(id);
        if (!feed) return respond("unknown feed");
        const cfg: Record<string, string> = {};
        for (const f of feed.fields) cfg[f.key] = str(fields[f.key]);
        db.prepare("UPDATE feeds SET config = ? WHERE id = ?").run(JSON.stringify(cfg), id);
        // immediately test + refresh with the new config so the status is fresh
        const test = await testFeed(id);
        if (test.ok) await refreshFeed(id);
        return respond(`config saved · test: ${test.message}`);
      }
      case "refresh-feed": {
        const id = str(fields.id);
        const result = await refreshFeed(id);
        if (isJson) {
          return respondJson(result.status === "ok", `${id}: ${result.status} · ${result.itemCount} items · ${result.durationMs}ms`, {
            status: result.status,
            itemCount: result.itemCount
          });
        }
        return respond(`${id} refresh: ${result.status}${result.error ? ` — ${result.error}` : ` · ${result.itemCount} items`}`);
      }
      case "test-feed": {
        const id = str(fields.id);
        const result = await testFeed(id);
        if (isJson) {
          return respondJson(result.ok, `${id}: ${result.message}`, {
            ok: result.ok,
            message: result.message,
            detail: result.detail ?? null,
            at: result.at
          });
        }
        return respond(`test ${result.ok ? "passed" : "failed"} — ${result.message}`);
      }
      case "refresh-all": {
        const results = await refreshAllEnabled();
        const ok = results.filter((r) => r.status === "ok").length;
        if (isJson) return respondJson(true, `${ok}/${results.length} feeds refreshed`);
        return respond(`refreshed ${ok}/${results.length} feeds`);
      }
      case "test-all": {
        const { FEEDS } = await import("../../../feeds/registry");
        const results: Json = {};
        let pass = 0;
        let ran = 0;
        for (const feed of FEEDS) {
          const row = db.prepare("SELECT enabled FROM feeds WHERE id = ?").get(feed.id) as { enabled: number } | undefined;
          if (!row?.enabled) continue;
          ran++;
          const t = await testFeed(feed.id);
          if (t.ok) pass++;
          results[feed.id] = { ok: t.ok, message: t.message, at: t.at };
        }
        if (isJson) return respondJson(true, `${pass}/${ran} enabled feeds passed`, { results });
        return respond(`connection tests: ${pass}/${ran} passed`);
      }

      default:
        return new Response(`Unknown op “${op}”`, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isJson) return respondJson(false, message);
    return respond(`error: ${message}`);
  }

  function respondJsonOrRedirect(msg: string) {
    if (isJson) return respondJson(true, msg);
    return respond(msg);
  }
};

const RESERVED_SLUGS = new Set([
  "", "admin", "api", "media", "public", "src", "favicon.svg", "robots.txt",
  "", "index", "projects", "activity", "live", "art", "links", "about", "system", "login", "logout"
]);

function normalizeSort(table: "projects" | "links" | "nav_items") {
  const db = getDB();
  const rows = db.prepare(`SELECT id FROM ${table} ORDER BY sort, id`).all() as { id: number }[];
  const upd = db.prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`);
  rows.forEach((r, i) => upd.run(i, r.id));
}
