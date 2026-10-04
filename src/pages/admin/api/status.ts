import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { getFeedStatuses } from "../../../feeds/runner";
import { getDB } from "../../../lib/db";

export const GET: APIRoute = async ({ cookies, request }) => {
  if (!verifySession(cookies.get("tapps_session")?.value)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const statuses = getFeedStatuses();
  const events = getDB()
    .prepare("SELECT feed_id, level, message, created_at FROM feed_events ORDER BY id DESC LIMIT 30")
    .all();
  return new Response(
    JSON.stringify({
      statuses: statuses.map(({ configKeys, ...s }) => {
        void configKeys;
        return s;
      }),
      events,
      fetchedAt: new Date().toISOString()
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
};
