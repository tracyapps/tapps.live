// The feed registry — one array to rule every integration. Admin UI, the
// status page, the scheduler, and the CLI all iterate this.
import type { FeedModule } from "./types";
import { githubFeed } from "./github";
import { artFeed } from "./artrss";
import { youtubeFeed } from "./youtube";
import { twitchFeed } from "./twitch";
import { lastfmFeed } from "./lastfm";
import { blueskyFeed } from "./bluesky";

export const FEEDS: FeedModule[] = [
  githubFeed,
  artFeed,
  twitchFeed,
  youtubeFeed,
  blueskyFeed,
  lastfmFeed
];

export function feedById(id: string): FeedModule | undefined {
  return FEEDS.find((f) => f.id === id);
}

/**
 * Integrations that are deliberately link-only: no public, keyless API
 * exists (Instagram/TikTok graph access requires reviewed apps). Shown on
 * the admin status page so "why isn't this a feed" has an answer.
 */
export const LINK_ONLY = [
  { id: "instagram", label: "Instagram", note: "No public content API — needs a reviewed Meta app. Link tile only for now." },
  { id: "tiktok", label: "TikTok", note: "Display API requires approved client keys. Link tile only for now." }
];
