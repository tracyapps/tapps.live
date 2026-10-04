import { getDB } from "../../lib/db";

// Media served from SQLite so uploads survive redeploys on any host.
export const GET = async ({ params }: { params: { id: string } }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return new Response("Bad request", { status: 400 });
  const row = getDB()
    .prepare("SELECT mime, bytes FROM media WHERE id = ?")
    .get(id) as { mime: string; bytes: Uint8Array } | undefined;
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.bytes), {
    headers: {
      "content-type": row.mime,
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
};
