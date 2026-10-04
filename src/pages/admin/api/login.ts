import type { APIRoute } from "astro";
import { createSession, checkPassword, sessionCookie } from "../../../lib/auth";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");
  const next = String(form?.get("next") ?? "/admin");

  // only allow internal redirects
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";

  if (!password || !checkPassword(password)) {
    return redirect(`/admin/login?error=1&next=${encodeURIComponent(safeNext)}`, 302);
  }

  cookies.set(sessionCookie.name, createSession(), sessionCookie.options);
  return redirect(safeNext, 302);
};
