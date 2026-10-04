// Color token table — kept in lockstep with :root in src/styles/theme.css.
// Rendered live on /system (with computed contrast ratios) and enforced by
// tests/contrast.test.ts. Every pairing here must pass WCAG AA.
import { contrastRatio } from "./contrast";

export interface Token {
  name: string;
  hex: string;
  role: string;
}

export const TOKENS: Token[] = [
  { name: "--bg", hex: "#050505", role: "page canvas" },
  { name: "--surface", hex: "#111111", role: "cards, footer, inputs" },
  { name: "--surface-warm", hex: "#211022", role: "ticker, video frames" },
  { name: "--fg", hex: "#ffffff", role: "headings, primary text" },
  { name: "--fg-2", hex: "#e5e7eb", role: "body copy, nav links" },
  { name: "--muted", hex: "#9ca3af", role: "kickers, meta, captions" },
  { name: "--accent / --meta", hex: "#ff00a8", role: "the loud moment — links, pips, fills" },
  { name: "--accent-on", hex: "#050505", role: "ink on accent fills" },
  { name: "--success", hex: "#22c55e", role: "live pips, good bars, lime fill" },
  { name: "--warn", hex: "#facc15", role: "beta pips, sun fill" },
  { name: "--danger", hex: "#ef4444", role: "build pips, hot fill" },
  { name: "--live-badge", hex: "#9a2828", role: "broadcast LIVE badge (white ink passes AA)" },
  { name: "--mint", hex: "#3cffd0", role: "duo ink — jelly mint" },
  { name: "--ultra", hex: "#5200ff", role: "duo ink — ultraviolet" },
  { name: "--border", hex: "#2b2b2b", role: "hairlines" },
  { name: "--border-soft", hex: "#1d1d1d", role: "bar tracks" }
];

export interface FillToken {
  name: string;
  hex: string;
  ink: string; // the text color that must ride on this fill
  note: string;
}

/** Loud surfaces and their verified inks — the a11y contract for fills. */
export const FILLS: FillToken[] = [
  { name: "fill-magenta", hex: "#ff00a8", ink: "#050505", note: "accent field" },
  { name: "fill-lime", hex: "#22c55e", ink: "#050505", note: "success field" },
  { name: "fill-sun", hex: "#facc15", ink: "#050505", note: "warn field" },
  { name: "fill-hot", hex: "#ef4444", ink: "#050505", note: "danger field" },
  { name: "fill-tang", hex: "#ff9577", ink: "#050505", note: "oklab sun 58% + accent" },
  { name: "fill-mint", hex: "#59e6c2", ink: "#050505", note: "oklab mint 62% + accent" },
  { name: "fill-grape", hex: "#a31c71", ink: "#e5e7eb", note: "oklab accent 62% + surface-warm (light ink)" }
];

export interface CheckedPair {
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  passes: boolean;
}

/** The text/background pairs the site actually ships. */
export function checkedPairs(): CheckedPair[] {
  const byName = (n: string) => TOKENS.find((t) => t.name === n)!.hex;
  const pairs: { label: string; fg: string; bg: string }[] = [
    { label: "body on canvas", fg: byName("--fg-2"), bg: byName("--bg") },
    { label: "body on surface", fg: byName("--fg-2"), bg: byName("--surface") },
    { label: "body on surface-warm", fg: byName("--fg-2"), bg: byName("--surface-warm") },
    { label: "muted meta on canvas", fg: byName("--muted"), bg: byName("--bg") },
    { label: "muted meta on surface", fg: byName("--muted"), bg: byName("--surface") },
    { label: "muted meta on surface-warm", fg: byName("--muted"), bg: byName("--surface-warm") },
    { label: "accent link on canvas", fg: byName("--accent / --meta"), bg: byName("--bg") },
    { label: "accent link on surface", fg: byName("--accent / --meta"), bg: byName("--surface") },
    { label: "white on live badge", fg: "#ffffff", bg: byName("--live-badge") },
    { label: "accent-on ink on accent fill", fg: byName("--accent-on"), bg: byName("--accent / --meta") }
  ];
  for (const f of FILLS) {
    pairs.push({ label: `${f.name} ink`, fg: f.ink, bg: f.hex });
  }
  return pairs.map((p) => ({
    ...p,
    ratio: Math.round(contrastRatio(p.fg, p.bg) * 100) / 100,
    passes: contrastRatio(p.fg, p.bg) >= 4.5
  }));
}
