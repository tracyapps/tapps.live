// ROADMAP.md convention — lets a repo own its live roadmap and tapps.live
// render it. Format:
//
//     # papr.world roadmap
//     progress: 61                ← optional manual override for the headline %
//     ## The invited alpha
//     <!-- 83 -->                 ← optional explicit phase %
//     - [x] invites flowing
//     - [ ] stress test the mail
//
// Without overrides, phase % = checked / total and the project % is the
// task-weighted average of all phases.
import type { RoadmapRow } from "../lib/db";

export interface ParsedRoadmap {
  progress: number | null;
  phases: (RoadmapRow & { done: number; total: number })[];
}

interface PhaseAcc {
  label: string;
  level: number;
  override: number | null;
  checked: number;
  total: number;
}

export function parseRoadmap(markdown: string): ParsedRoadmap {
  const lines = markdown.split(/\r?\n/);
  let manual: number | null = null;
  const phases: PhaseAcc[] = [];
  let current: PhaseAcc | null = null;
  let pendingOverride: number | null = null;

  for (const raw of lines) {
    const line = raw.trim();

    const prog = line.match(/^progress:\s*(\d{1,3})\s*$/i);
    if (prog) {
      manual = Math.min(100, parseInt(prog[1], 10));
      continue;
    }

    const head = line.match(/^(#{1,6})\s+(.+)$/);
    if (head) {
      if (current) phases.push(current);
      current = {
        label: head[2].replace(/[*_`]/g, "").trim(),
        level: head[1].length,
        override: pendingOverride,
        checked: 0,
        total: 0
      };
      pendingOverride = null;
      continue;
    }

    const explicit = line.match(/^<!--\s*(\d{1,3})\s*-->$/);
    if (explicit && current) {
      current.override = Math.min(100, parseInt(explicit[1], 10));
      continue;
    }

    const task = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (task && current) {
      current.total += 1;
      if (task[1].toLowerCase() === "x") current.checked += 1;
      continue;
    }
  }
  if (current) phases.push(current);

  // the h1 doc title is not a phase; h2+ headings are, even with no tasks yet
  const real = phases.filter((p) => p.level > 1 || p.total > 0 || p.override != null);

  const out = real.map((p) => ({
    label: p.label,
    pct: p.override != null ? p.override : p.total ? Math.round((p.checked / p.total) * 100) : 0,
    done: p.checked,
    total: p.total
  }));

  let progress = manual;
  if (progress == null) {
    const totalTasks = real.reduce((a, p) => a + p.total, 0);
    const doneTasks = real.reduce((a, p) => a + p.checked, 0);
    if (totalTasks > 0) progress = Math.round((doneTasks / totalTasks) * 100);
  }

  return { progress, phases: out };
}
