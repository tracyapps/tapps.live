import { describe, it, expect } from "vitest";
import { parseYouTubeAtom } from "../src/feeds/youtube";
import { normalizeTracks, normalizeTopArtists } from "../src/feeds/lastfm";
import { buildLiveState } from "../src/feeds/twitch";
import { normalizeFeed } from "../src/feeds/bluesky";

describe("youtube atom parser", () => {
  const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <yt:videoId>abc123</yt:videoId>
    <title>Colony attempt #47 — the bathroom incident</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
    <published>2026-09-28T02:00:00+00:00</published>
    <media:group>
      <media:title>Colony attempt #47</media:title>
      <media:thumbnail url="https://i.ytimg.com/vi/abc123/mqdefault.jpg" width="320" height="180"/>
    </media:group>
  </entry>
</feed>`;

  it("parses video id, title, thumbnail, url", () => {
    const videos = parseYouTubeAtom(ATOM);
    expect(videos).toHaveLength(1);
    expect(videos[0].id).toBe("abc123");
    expect(videos[0].title).toBe("Colony attempt #47 — the bathroom incident");
    expect(videos[0].image).toContain("i.ytimg.com/vi/abc123");
    expect(videos[0].url).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("returns [] for junk", () => {
    expect(parseYouTubeAtom("<not-a-feed/>")).toEqual([]);
  });
});

describe("last.fm normalizers", () => {
  it("marks the now-playing track and keeps order", () => {
    const tracks = normalizeTracks([
      { artist: { "#text": "Khruangbin" }, name: "August 10", date: { uts: "1759300000" }, "@attr": { nowplaying: "true" } },
      { artist: { "#text": "Y La Bamba" }, name: "Cuatro Crazy", date: { uts: "1759290000" } }
    ]);
    expect(tracks[0].nowPlaying).toBe(true);
    expect(tracks[1].nowPlaying).toBe(false);
    expect(tracks[1].uts).toBe(1759290000);
  });

  it("normalizes top artists with counts", () => {
    const top = normalizeTopArtists([
      { name: "Khruangbin", playcount: "42", url: "https://last.fm/x" },
      { name: "Bacao", playcount: "7" }
    ]);
    expect(top[0]).toEqual({ name: "Khruangbin", count: 42, url: "https://last.fm/x" });
    expect(top[1].count).toBe(7);
  });
});

describe("twitch live state", () => {
  it("builds a live state from an active stream", () => {
    const state = buildLiveState(
      { id: "7", login: "tracyapps", display_name: "tracyapps" },
      [{ title: "bathroom crisis arc", game_name: "Oxygen Not Included", viewer_count: 12, started_at: "2026-10-01T20:00:00Z", thumbnail_url: "https://t/{width}x{height}.jpg" }],
      "tracyapps"
    );
    expect(state.live).toBe(true);
    expect(state.game).toBe("Oxygen Not Included");
    expect(state.viewers).toBe(12);
    expect(state.thumbnail).toBe("https://t/640x360.jpg");
    expect(state.channelUrl).toBe("https://twitch.tv/tracyapps");
  });

  it("reports offline with no streams", () => {
    const state = buildLiveState({ id: "7", login: "tracyapps", display_name: "t" }, [], "tracyapps");
    expect(state.live).toBe(false);
    expect(state.channelUrl).toBe("https://twitch.tv/tracyapps");
  });
});

describe("bluesky normalizer", () => {
  it("builds post urls and counts", () => {
    const skeets = normalizeFeed([
      {
        uri: "at://did:plc:abc/app.bsky.feed.post/3l7x",
        cid: "x",
        record: { text: "the colony update nobody asked for", createdAt: "2026-09-29T12:00:00.000Z" },
        author: { handle: "tapp.ps" },
        likeCount: 4,
        repostCount: 1
      }
    ]);
    expect(skeets[0].text).toContain("colony");
    expect(skeets[0].url).toContain("did:plc:abc");
    expect(skeets[0].url).toContain("/post/3l7x");
    expect(skeets[0].likes).toBe(4);
  });
});
