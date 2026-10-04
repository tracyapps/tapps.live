// Bluesky — public AppView API, no auth. Latest posts from the author feed.
import type { FeedModule, FeedFetchResult, FeedTestResult, FeedItem } from "./types";
import { fetchJson } from "./types";

interface BskyPost {
  post: {
    uri: string;
    cid: string;
    record: { text: string; createdAt: string };
    author: { handle: string; displayName?: string };
    embed?: {
      images?: { image?: { ref?: { $link?: string } }; thumb?: string; alt?: string }[];
      external?: { thumb?: string };
    };
    replyCount?: number;
    repostCount?: number;
    likeCount?: number;
  };
}

export interface NormalizedSkeet {
  uri: string;
  url: string;
  text: string;
  createdAt: string;
  authorHandle: string;
  image?: string;
  likes: number;
  reposts: number;
}

function bskyUrl(uri: string, handle: string): string {
  const [, , did] = uri.split("/");
  const rkey = uri.split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`.replace(`/profile/${handle}`, `/profile/${did || handle}`);
}

export function normalizeFeed(feed: BskyPost["post"][]): NormalizedSkeet[] {
  return feed.slice(0, 12).map((p) => ({
    uri: p.uri,
    url: bskyUrl(p.uri, p.author.handle),
    text: p.record?.text ?? "",
    createdAt: p.record?.createdAt ?? "",
    authorHandle: p.author.handle,
    image: p.embed?.images?.[0]?.thumb || p.embed?.external?.thumb || undefined,
    likes: p.likeCount ?? 0,
    reposts: p.repostCount ?? 0
  }));
}

export const blueskyFeed: FeedModule = {
  id: "bluesky",
  label: "Bluesky",
  description: "Latest posts via the public AppView API — no keys, no auth, works out of the box.",
  category: "content",
  icon: "BS",
  fields: [{ key: "actor", label: "Handle", type: "text", placeholder: "tapp.ps" }],
  defaults: { actor: "tapp.ps" },
  requiredKeys: ["actor"],
  refreshMinutes: 15,

  async fetch(cfg): Promise<FeedFetchResult> {
    const actor = cfg.actor.replace(/^@/, "");
    const json = await fetchJson<{ feed?: BskyPost[] }>(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=20&filter-posts`
    );
    const skeets = normalizeFeed((json.feed ?? []).map((f) => f.post));
    if (!skeets.length) throw new Error("Bluesky feed returned zero posts");
    return {
      items: skeets.map<Item0>((s) => ({
        guid: s.uri,
        title: s.text.length > 120 ? s.text.slice(0, 119) + "…" : s.text,
        url: s.url,
        publishedAt: s.createdAt,
        image: s.image,
        kind: "post",
        detail: `♡ ${s.likes} · ↻ ${s.reposts}`,
        extra: { likes: s.likes, reposts: s.reposts }
      })),
      meta: { actor }
    };
  },

  async test(cfg): Promise<FeedTestResult> {
    const actor = cfg.actor.replace(/^@/, "");
    const json = await fetchJson<{ feed?: BskyPost[] }>(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=5`,
      {},
      10000
    );
    const count = json.feed?.length ?? 0;
    if (!count) return { ok: false, message: `Reachable, but no posts for @${actor}` };
    return { ok: true, message: `Connected to @${actor} · ${count} posts`, detail: "public AppView, no auth needed" };
  }
};

type Item0 = FeedItem;
