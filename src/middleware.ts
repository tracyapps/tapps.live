import { defineMiddleware } from "astro:middleware";
import { verifySession } from "./lib/auth";
import { ensureScheduler } from "./feeds/runner";

// Admin guard + lazy feed scheduler start. The scheduler can't run during
// `astro build` (middleware never executes there) so no build-time network.
export const onRequest = defineMiddleware((context, next) => {
  ensureScheduler();
  const { url, cookies, redirect, request } = context;
  const path = url.pathname;

  if (path.startsWith("/admin")) {
    // the login page and its POST endpoint are the only unauthenticated admin routes
    const isLogin = path === "/admin/login" || path === "/admin/api/login";
    const ok = verifySession(cookies.get("tapps_session")?.value);
    if (!ok && !isLogin) {
      return redirect("/admin/login?next=" + encodeURIComponent(path));
    }
    if (ok && isLogin) {
      return redirect("/admin");
    }
    // CSRF for admin mutations: SameSite=strict + origin check + form token
    if (request.method === "POST") {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");
      if (origin && host && new URL(origin).host !== host) {
        return new Response("Cross-origin POST blocked", { status: 403 });
      }
    }
  }

  return next();
});
