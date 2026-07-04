import { useEffect, useState } from "react";

export type WidgetDef = { id: string; label: string };
export type WidgetState = { id: string; enabled: boolean };

const KEY = (scope: string) => `wcfg:${scope}`;

export function normalize(defs: WidgetDef[], stored: WidgetState[] | null): WidgetState[] {
  const map = new Map((stored ?? []).map((s) => [s.id, s]));
  const ordered: WidgetState[] = [];
  // keep stored order first
  (stored ?? []).forEach((s) => {
    if (defs.find((d) => d.id === s.id)) ordered.push({ id: s.id, enabled: s.enabled });
  });
  // append new defs
  defs.forEach((d) => {
    if (!map.has(d.id)) ordered.push({ id: d.id, enabled: true });
  });
  return ordered;
}

export function useWidgetConfig(scope: string, defs: WidgetDef[]) {
  const [state, setState] = useState<WidgetState[]>(() => normalize(defs, null));

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY(scope)) : null;
      const parsed = raw ? (JSON.parse(raw) as WidgetState[]) : null;
      setState(normalize(defs, parsed));
    } catch {
      setState(normalize(defs, null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const save = (next: WidgetState[]) => {
    setState(next);
    try {
      window.localStorage.setItem(KEY(scope), JSON.stringify(next));
    } catch {}
  };

  return { state, save };
}

export function moveItem<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[idx], copy[j]] = [copy[j], copy[idx]];
  return copy;
}