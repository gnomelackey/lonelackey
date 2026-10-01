/**
 * Pure sync logic — no Obsidian imports, so it can be unit-tested in Node.
 *
 * Reads Lonelog tags from a session note:
 *   [PC:Name|HP 6/8|Luck 0/1]   set values (current/max)     [PC:Name|HP-3]    change a value
 *   [PC:Name|Lost:Spell]        mark a spell lost             [PC:Name|Regain:Spell] / [PC:Name|Rest]
 *   [Inv:Item-1] [Inv:Item|5]   inventory counters            [Wealth:Gold-5]   coins
 * and turns them into idempotent changes to character-note properties.
 */

export type OpKind = "abs" | "delta";

export interface Op {
  owner: string;       // character name as written in the log
  field: string;       // canonical field: "hp", "luck", "stealthy", "inv:bolts", "wealth:gp"
  kind: OpKind;
  value: number;
  line: number;        // 0-based line in the session note
}

export interface KeyResult {
  owner: string;
  field: string;
  mode: OpKind;        // "abs" → set to value; "delta" → net change from this session
  value: number;
}

const slug = (s: string) => s.trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Maps a coin name used in [Wealth:…] tags (lower-case) to a sheet property. Configurable in settings. */
export type CoinMap = Record<string, string>;

export const DEFAULT_COINS: CoinMap = { gold: "gp", gp: "gp", silver: "sp", sp: "sp", copper: "cp", cp: "cp" };

/** Parse "gold=gp, silver=sp" into a CoinMap. Unparseable pairs are skipped. */
export function parseCoinMap(spec: string): CoinMap {
  const out: CoinMap = {};
  for (const pair of spec.split(/[,\n]/)) {
    const [name, prop] = pair.split("=").map((x) => x.trim());
    if (name && prop) out[name.toLowerCase()] = prop;
  }
  return out;
}

/** Parse "8->6", "6/8", "6", "+2", "-3", "20->17/20". Returns abs (with optional max) or delta. */
export function parseAmount(raw: string): { kind: OpKind; value: number; max?: number } | null {
  let s = raw.trim().replace(/→/g, "->");
  if (!s) return null;
  const d = s.match(/^([+-])\s*(\d+)$/);
  if (d) return { kind: "delta", value: (d[1] === "-" ? -1 : 1) * parseInt(d[2], 10) };
  if (s.includes("->")) s = s.split("->").pop()!.trim();
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return { kind: "abs", value: parseInt(frac[1], 10), max: parseInt(frac[2], 10) };
  const n = s.match(/^(\d+)$/);
  if (n) return { kind: "abs", value: parseInt(n[1], 10) };
  if (/^depleted$/i.test(s)) return { kind: "abs", value: 0 };
  return null;
}

const PC_TAG = /\[PC:([^\]|]+)((?:\|[^\]]*)?)\]/g;       // excludes [#PC:…] references (the # sits before PC)
const INV_TAG = /\[Inv:([^\]|]+)((?:\|[^\]]*)?)\]/g;
const WEALTH_TAG = /\[Wealth:([^\]]+)\]/g;
const ACTION_ACTOR = /^\s*@\s*\[(#?)(PC|N|F|[^\]:|]+)(?::([^\]|]+))?/;

/** Extract every resource operation from a session note, in document order. */
export function parseSession(text: string, coins: CoinMap = DEFAULT_COINS): Op[] {
  const ops: Op[] = [];
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let inFrontmatter = lines[0]?.trim() === "---";
  let context: string | null = null; // current PC acting, for Inv/Wealth tags without an explicit owner

  lines.forEach((line, i) => {
    if (inFrontmatter) {
      if (i > 0 && line.trim() === "---") inFrontmatter = false;
      return;
    }
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;

    // An action line sets who is acting. Only a PC keeps the context; NPCs, foes and [Party] clear it.
    const actor = line.match(ACTION_ACTOR);
    if (actor) context = actor[2] === "PC" && !actor[1] && actor[3] ? actor[3].trim() : null;

    for (const m of line.matchAll(PC_TAG)) {
      if (line[m.index - 1] === "#") continue;
      const owner = m[1].trim();
      for (const f of (m[2] || "").split("|").map((x) => x.trim()).filter(Boolean)) {
        const fm = f.match(/^([A-Za-z][A-Za-z '’]*?)\s*([+-]?\s*\d[\d\s/>→-]*|depleted)$/i);
        if (!fm) continue; // bare conditions like "Invisible", or "Gear:…"
        const amt = parseAmount(fm[2]);
        if (!amt) continue;
        const field = slug(fm[1]);
        ops.push({ owner, field, kind: amt.kind, value: amt.value, line: i });
        if (amt.max !== undefined) ops.push({ owner, field: `${field}_max`, kind: "abs", value: amt.max, line: i });
      }
    }

    for (const m of line.matchAll(INV_TAG)) {
      if (line[m.index - 1] === "#") continue;
      const fields = (m[2] || "").split("|").map((x) => x.trim()).filter(Boolean);
      const ownerField = fields.find((f) => f.startsWith("@"));
      const owner = ownerField ? ownerField.slice(1).trim() : context;
      if (!owner) continue;
      let name = m[1].trim();
      let amt: ReturnType<typeof parseAmount> = null;
      const delta = name.match(/^(.+?)\s*([+-]\d+)$/);
      const arrow = name.match(/^(.+?)\s+(\d+\s*(?:->|→)\s*\d+)$/);
      const bundle = name.match(/^(.+?)\s*[×x]\s*(\d+)$/);
      if (delta) { name = delta[1]; amt = parseAmount(delta[2]); }
      else if (arrow) { name = arrow[1]; amt = parseAmount(arrow[2]); }
      else if (bundle) { name = bundle[1]; amt = parseAmount(bundle[2]); }
      else {
        const q = fields.find((f) => !f.startsWith("@"));
        if (q) amt = parseAmount(q);
      }
      if (!amt) continue;
      ops.push({ owner, field: `inv:${slug(name)}`, kind: amt.kind, value: amt.value, line: i });
    }

    for (const m of line.matchAll(WEALTH_TAG)) {
      if (line[m.index - 1] === "#") continue;
      const parts = m[1].split("|").map((x) => x.trim()).filter(Boolean);
      const ownerField = parts.find((p) => p.startsWith("@"));
      const owner = ownerField ? ownerField.slice(1).trim() : context;
      if (!owner) continue;
      for (const p of parts) {
        if (p.startsWith("@")) continue;
        const pm = p.match(/^([^+\-\s>]+)\s*([+\-\d>→].*)$/);
        if (!pm) continue;
        const coin = coins[pm[1].toLowerCase()];
        const amt = parseAmount(pm[2]);
        if (!coin || !amt) continue;
        ops.push({ owner, field: `wealth:${coin}`, kind: amt.kind, value: amt.value, line: i });
      }
    }
  });
  return ops;
}

/**
 * Collapse a session's ops into one result per (owner, field):
 * - if the session sets the value outright anywhere, the result is that last value plus any changes after it;
 * - otherwise the result is the session's net change.
 */
export function summarize(ops: Op[]): Map<string, KeyResult> {
  const out = new Map<string, KeyResult>();
  for (const op of ops) {
    const key = `${op.owner.toLowerCase()}|${op.field}`;
    const cur = out.get(key);
    if (op.kind === "abs") out.set(key, { owner: op.owner, field: op.field, mode: "abs", value: op.value });
    else if (!cur) out.set(key, { owner: op.owner, field: op.field, mode: "delta", value: op.value });
    else cur.value += op.value;
  }
  return out;
}

export interface SessionMemory { abs: Record<string, number>; net: Record<string, number> }

export interface Change { key: string; owner: string; field: string; kind: "set" | "adjust"; value: number }

/**
 * Decide what to write, given what this session applied last time.
 * Idempotent: re-saving an unchanged note yields no changes; deleting a delta tag reverses it.
 * `fieldSource` guards absolutes so an older session can't overwrite a newer session's value.
 */
export function reconcile(
  results: Map<string, KeyResult>,
  memory: SessionMemory,
  fieldSource: Record<string, number>,
  sessionNumber: number,
): { changes: Change[]; memory: SessionMemory; fieldSource: Record<string, number> } {
  const changes: Change[] = [];
  const next: SessionMemory = { abs: {}, net: {} };
  const src = { ...fieldSource };

  for (const [key, r] of results) {
    if (r.mode === "abs") {
      next.abs[key] = r.value;
      const newer = sessionNumber >= (src[key] ?? -Infinity);
      if (memory.abs[key] !== r.value && newer) {
        changes.push({ key, owner: r.owner, field: r.field, kind: "set", value: r.value });
        src[key] = sessionNumber;
      }
    } else {
      next.net[key] = r.value;
      const diff = r.value - (memory.net[key] ?? 0);
      if (diff !== 0) changes.push({ key, owner: r.owner, field: r.field, kind: "adjust", value: diff });
    }
  }
  // Delta tags that were removed since last time: undo what they applied.
  for (const [key, applied] of Object.entries(memory.net)) {
    if (results.has(key) || applied === 0) continue;
    const [ownerLower, field] = key.split("|");
    changes.push({ key, owner: ownerLower, field, kind: "adjust", value: -applied });
  }
  return { changes, memory: next, fieldSource: src };
}

/** Candidate frontmatter keys for a canonical field, most specific first. */
export function propertyCandidates(field: string): string[] {
  if (field.startsWith("wealth:")) return [field.slice(7)];
  if (field.startsWith("inv:")) {
    const b = field.slice(4);
    const singular = b.replace(/ies$/, "y").replace(/(ch|sh|x)es$/, "$1").replace(/s$/, "");
    return [...new Set([b, singular, `${singular}s`, `${singular}es`])];
  }
  return [field];
}

// ── Spells lost for the day ─────────────────────────────────────
// [PC:Name|Lost:Spell] adds a spell, [PC:Name|Regain:Spell] removes one, [PC:Name|Rest] clears the list.

export const LOST_FIELD = "spells_lost";

export interface ListOp { owner: string; kind: "add" | "remove" | "clear"; item: string; line: number }

export function parseListOps(text: string): ListOp[] {
  const ops: ListOp[] = [];
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let inFrontmatter = lines[0]?.trim() === "---";
  lines.forEach((line, i) => {
    if (inFrontmatter) { if (i > 0 && line.trim() === "---") inFrontmatter = false; return; }
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    for (const m of line.matchAll(PC_TAG)) {
      if (line[m.index - 1] === "#") continue;
      const owner = m[1].trim();
      for (const f of (m[2] || "").split("|").map((x) => x.trim()).filter(Boolean)) {
        if (/^rest(ed)?$/i.test(f)) { ops.push({ owner, kind: "clear", item: "", line: i }); continue; }
        const lost = f.match(/^lost\s*:\s*(.+)$/i);
        if (lost) { ops.push({ owner, kind: "add", item: lost[1].trim(), line: i }); continue; }
        const regain = f.match(/^regain(ed)?\s*:\s*(.+)$/i);
        if (regain) ops.push({ owner, kind: "remove", item: regain[2].trim(), line: i });
      }
    }
  });
  return ops;
}

export interface ListResult { owner: string; mode: "set" | "patch"; set: string[]; add: string[]; remove: string[] }

const lc = (s: string) => s.toLowerCase();
const has = (list: string[], item: string) => list.some((x) => lc(x) === lc(item));
const without = (list: string[], item: string) => list.filter((x) => lc(x) !== lc(item));
const minus = (a: string[], b: string[]) => a.filter((x) => !has(b, x));

/** One result per character: either the full list (if they rested this session) or the adds/removes. */
export function summarizeLists(ops: ListOp[]): Map<string, ListResult> {
  const out = new Map<string, ListResult>();
  for (const op of ops) {
    const key = `${lc(op.owner)}|${LOST_FIELD}`;
    const r = out.get(key) ?? { owner: op.owner, mode: "patch" as const, set: [], add: [], remove: [] };
    if (op.kind === "clear") { r.mode = "set"; r.set = []; r.add = []; r.remove = []; }
    else if (r.mode === "set") {
      r.set = op.kind === "add" ? (has(r.set, op.item) ? r.set : [...r.set, op.item]) : without(r.set, op.item);
    } else if (op.kind === "add") {
      r.remove = without(r.remove, op.item);
      if (!has(r.add, op.item)) r.add.push(op.item);
    } else if (has(r.add, op.item)) {
      r.add = without(r.add, op.item);           // lost and regained in the same session: no net change
    } else if (!has(r.remove, op.item)) {
      r.remove.push(op.item);
    }
    out.set(key, r);
  }
  return out;
}

export interface ListMemory { set: Record<string, string[]>; add: Record<string, string[]>; remove: Record<string, string[]> }
export interface ListChange { key: string; owner: string; kind: "set" | "add" | "remove"; items: string[] }

export function reconcileLists(
  results: Map<string, ListResult>,
  memory: ListMemory,
  fieldSource: Record<string, number>,
  sessionNumber: number,
): { changes: ListChange[]; memory: ListMemory; fieldSource: Record<string, number> } {
  const changes: ListChange[] = [];
  const next: ListMemory = { set: {}, add: {}, remove: {} };
  const src = { ...fieldSource };
  const push = (key: string, owner: string, kind: ListChange["kind"], items: string[]) => {
    if (items.length || kind === "set") changes.push({ key, owner, kind, items });
  };

  for (const [key, r] of results) {
    if (r.mode === "set") {
      next.set[key] = r.set;
      const same = JSON.stringify((memory.set[key] ?? null)?.map(lc)) === JSON.stringify(r.set.map(lc));
      if (!same && sessionNumber >= (src[key] ?? -Infinity)) { push(key, r.owner, "set", r.set); src[key] = sessionNumber; }
      // Anything this session patched before switching to a rest is superseded by the full list.
    } else {
      next.add[key] = r.add;
      next.remove[key] = r.remove;
      const oldAdd = memory.add[key] ?? [];
      const oldRem = memory.remove[key] ?? [];
      push(key, r.owner, "add", [...minus(r.add, oldAdd), ...minus(oldRem, r.remove)]);
      push(key, r.owner, "remove", [...minus(r.remove, oldRem), ...minus(oldAdd, r.add)]);
    }
  }
  // Tags deleted since last time: undo them.
  for (const key of new Set([...Object.keys(memory.add), ...Object.keys(memory.remove)])) {
    if (results.has(key)) continue;
    const owner = key.split("|")[0];
    push(key, owner, "remove", memory.add[key] ?? []);
    push(key, owner, "add", memory.remove[key] ?? []);
  }
  return { changes, memory: next, fieldSource: src };
}

/** Apply a list change to a current list (case-insensitive, keeps the casing already on the sheet). */
export function applyListChange(current: string[], change: ListChange): string[] {
  if (change.kind === "set") return [...change.items];
  if (change.kind === "add") return change.items.reduce((acc, it) => (has(acc, it) ? acc : [...acc, it]), current);
  return change.items.reduce((acc, it) => without(acc, it), current);
}
