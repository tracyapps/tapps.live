import { describe, it, expect } from "vitest";
import { parseWordPressRss, firstImageFromHtml } from "../src/feeds/artrss";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Art by Tapps</title>
    <item>
      <title>Magenta Marsh, 18×24</title>
      <link>https://artbytapps.com/magenta-marsh/</link>
      <pubDate>Wed, 30 Sep 2026 10:00:00 +0000</pubDate>
      <guid isPermaLink="false">https://artbytapps.com/?p=412</guid>
      <description>Misty wetland study in seven layers.</description>
      <media:content url="https://artbytapps.com/wp-content/uploads/2026/09/marsh-1024.jpg" medium="image" />
      <content:encoded><![CDATA[<p>Layers and layers of glaze. <img src="https://artbytapps.com/wp-content/uploads/2026/09/marsh-full.jpg" alt="marsh" /></p>]]></content:encoded>
    </item>
    <item>
      <title>Older piece</title>
      <link>https://artbytapps.com/older/</link>
      <pubDate>Mon, 10 Aug 2026 09:00:00 +0000</pubDate>
      <guid isPermaLink="false">https://artbytapps.com/?p=400</guid>
      <description>Just a description &amp; some entities.</description>
      <content:encoded><![CDATA[<p>No media:content here, but there is <img src="https://artbytapps.com/older.jpg" width="600" /> inside.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

describe("WordPress RSS parser", () => {
  it("parses items with title, link, date", () => {
    const items = parseWordPressRss(FEED);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Magenta Marsh, 18×24");
    expect(items[0].url).toBe("https://artbytapps.com/magenta-marsh/");
    expect(items[0].publishedAt).toBe(new Date("2026-09-30T10:00:00Z").toISOString());
  });

  it("prefers media:content for the image", () => {
    const items = parseWordPressRss(FEED);
    expect(items[0].image).toBe("https://artbytapps.com/wp-content/uploads/2026/09/marsh-1024.jpg");
  });

  it("falls back to the first <img> in content:encoded", () => {
    const items = parseWordPressRss(FEED);
    expect(items[1].image).toBe("https://artbytapps.com/older.jpg");
  });

  it("builds a clean excerpt from description", () => {
    const items = parseWordPressRss(FEED);
    expect(items[0].excerpt).toContain("seven layers");
    expect(items[0].excerpt).not.toContain("<");
  });

  it("extracts the first image src from html", () => {
    expect(firstImageFromHtml('<p><img class="x" src="a.jpg" /><img src="b.jpg" /></p>')).toBe("a.jpg");
    expect(firstImageFromHtml("<p>none</p>")).toBeUndefined();
  });

  it("returns [] for non-rss xml", () => {
    expect(parseWordPressRss("<html><body>nope</body></html>")).toEqual([]);
  });
});
