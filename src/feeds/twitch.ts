// Twitch — app-access token (client credentials) + Helix. When configured,
// powers the LIVE badge, the embedded player on /live, and the home signal
// strip. Without keys it reports "needs config", never fake-offline.
import type { FeedModule, FeedFetchResult, FeedTestResult } from "./types";
import { fetchJson, fetchText, FeedError } from "./types";

export interface TwitchLive {
  live: boolean;
  title?: string;
  game?: string;
  viewers?: number;
  startedAt?: string;
  thumbnail?: string;
  channelUrl: string;
}

interface HelixUser {
  id: string;
  login: string;
  display_name: string;
}

async function getAppToken(clientId: string, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials"
  });
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new FeedError(
      `Twitch token request failed ${res.status}${text ? " · " + text.slice(0, 180) : ""}`,
      res.status
    );
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Combine users + streams Helix responses into the live state object. */
export function buildLiveState(
  user: HelixUser | undefined,
  streams: { title: string; game_name: string | null; viewer_count: number; started_at: string; thumbnail_url: string }[],
  login: string
): TwitchLive {
  const stream = streams[0];
  return {
    live: !!stream,
    title: stream?.title,
    game: stream?.game_name ?? undefined,
    viewers: stream?.viewer_count,
    startedAt: stream?.started_at,
    thumbnail: stream?.thumbnail_url?.replace("{width}", "640").replace("{height}", "360"),
    channelUrl: `https://twitch.tv/${user?.login ?? login}`
  };
}

async function helixGet<T>(url: string, token: string, clientId: string): Promise<T> {
  return fetchJson<T>(url, {
    headers: { "client-id": clientId, authorization: `Bearer ${token}` }
  });
}

export const twitchFeed: FeedModule = {
  id: "twitch",
  label: "Twitch",
  description:
    "Live/offline status via the Helix API. Needs a dev.twitch.tv app (client id + secret, no redirect URL). Until then this shows as “needs config” — the site stays honest instead of guessing offline.",
  category: "presence",
  icon: "TW",
  fields: [
    { key: "clientId", label: "Client ID", type: "text" },
    { key: "clientSecret", label: "Client secret", type: "password" },
    { key: "login", label: "Channel login", type: "text", placeholder: "tracyapps" }
  ],
  defaults: { clientId: "", clientSecret: "", login: "tracyapps" },
  envMap: { clientId: "TWITCH_CLIENT_ID", clientSecret: "TWITCH_CLIENT_SECRET", login: "TWITCH_LOGIN" },
  requiredKeys: ["clientId", "clientSecret", "login"],
  refreshMinutes: 3,

  async fetch(cfg): Promise<FeedFetchResult> {
    const token = await getAppToken(cfg.clientId, cfg.clientSecret);
    const users = await helixGet<{ data: HelixUser[] }>(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(cfg.login)}`,
      token,
      cfg.clientId
    );
    const user = users.data[0];
    if (!user) throw new FeedError(`No Twitch user named “${cfg.login}”`);
    const streams = await helixGet<{ data: { title: string; game_name: string | null; viewer_count: number; started_at: string; thumbnail_url: string }[] }>(
      `https://api.twitch.tv/helix/streams?user_id=${user.id}`,
      token,
      cfg.clientId
    );
    const live = buildLiveState(user, streams.data, cfg.login);
    return {
      items: live.live
        ? [
            {
              guid: `twitch-live:${live.startedAt}`,
              title: live.title || "Live on Twitch",
              url: live.channelUrl,
              publishedAt: live.startedAt,
              kind: "live",
              detail: `${live.game ?? "live"} · ${live.viewers ?? 0} watching`
            }
          ]
        : [],
      meta: { live, checkedAt: new Date().toISOString() }
    };
  },

  async test(cfg): Promise<FeedTestResult> {
    const token = await getAppToken(cfg.clientId, cfg.clientSecret);
    const users = await helixGet<{ data: HelixUser[] }>(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(cfg.login)}`,
      token,
      cfg.clientId
    );
    if (!users.data[0]) {
      return { ok: false, message: `Token works, but no channel named “${cfg.login}”`, detail: "Check the login spelling (lowercase, no #)." };
    }
    const streams = await helixGet<{ data: unknown[] }>(
      `https://api.twitch.tv/helix/streams?user_id=${users.data[0].id}`,
      token,
      cfg.clientId
    );
    return {
      ok: true,
      message: `Connected to ${users.data[0].display_name} · currently ${streams.data.length ? "LIVE" : "offline"}`,
      detail: "Client credentials flow verified end-to-end."
    };
  }
};

// keep fetchText referenced for future thumbnail fetches without bundler churn
void fetchText;
