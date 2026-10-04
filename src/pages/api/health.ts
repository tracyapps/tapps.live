import type { APIRoute } from "astro";
import { getFeedStatuses } from "../../feeds/runner";

// Liveness + feed summary for Railway's healthcheck (and any uptime monitor).
// Public by design — it only exposes counts the home signal strip shows anyway.
export const GET: APIRoute = async () => {
  const statuses = getFeedStatuses().filter((s) => !s.linkOnly);
  return new Response(
    JSON.stringify({
      ok: true,
      uptimeSeconds: Math.round(process.uptime()),
      feeds: {
        ok: statuses.filter((s) => s.status === "ok").length,
        enabled: statuses.filter((s) => s.enabled).length,
        total: statuses.length
      },
      at: new Date().toISOString()
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } }
  );
};
