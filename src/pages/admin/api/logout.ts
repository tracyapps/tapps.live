import type { APIRoute } from "astro";
import { sessionCookie, checkCsrf } from "../../../lib/auth";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData().catch(() => null);
  if (!checkCsrf(String(form?.get("csrf") ?? ""))) {
    return new Response("Bad CSRF token", { status: 403 });
  }
  cookies.delete(sessionCookie.name, { path: "/" });
  return redirect("/admin/login", 302);
};
