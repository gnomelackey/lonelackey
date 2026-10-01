import { describe, expect, it } from "vitest";
import {
  applyListChange, parseAmount, parseCoinMap, parseListOps, parseSession, propertyCandidates, reconcile,
  reconcileLists, summarize, summarizeLists, type KeyResult, type ListResult,
} from "../src/core";

const nums = (text: string) =>
  Object.fromEntries([...summarize(parseSession(text))].map(([k, v]: [string, KeyResult]) => [k, `${v.mode}:${v.value}`]));
const lists = (text: string) =>
  Object.fromEntries([...summarizeLists(parseListOps(text))].map(([k, v]: [string, ListResult]) =>
    [k, v.mode === "set" ? `set:${v.set.join(",")}` : `+${v.add.join(",")}/-${v.remove.join(",")}`]));

const SESSION = `---
tags: [session]
session: 3
---
# Session 3
\`\`\`generator
@ [PC:Ignored|HP 1/1]
\`\`\`
@ [PC:Mira|HP 7/9|Luck 1/1] Draws her blade.
d: 14 vs 12 → hit
@ [PC:Mira|HP 7/9|Luck 0/1] Uses luck to reroll. [Inv:Arrows-1]
=> The ogre hits back. [PC:Mira|HP-3]
@ [PC:Tobin] Searches the chest. [Inv:Rope|1] [Wealth:Gold+12|Silver 4]
@ [Party] Moves on. [Inv:Torch-1|@Tobin]
d: miscast [PC:Tobin|Lost:Light]
`;

describe("parsing", () => {
  it("reads PC status, changes, inventory and wealth from a session", () => {
    expect(nums(SESSION)).toEqual({
      "mira|hp": "abs:4", "mira|hp_max": "abs:9", "mira|luck": "abs:0", "mira|luck_max": "abs:1",
      "mira|inv:arrows": "delta:-1",
      "tobin|inv:rope": "abs:1", "tobin|wealth:gp": "delta:12", "tobin|wealth:sp": "abs:4", "tobin|inv:torch": "delta:-1",
    });
  });

  it("ignores frontmatter, code fences and #references", () => {
    expect(parseSession("```\n@ [PC:X|HP 1/1]\n```")).toHaveLength(0);
    expect(parseSession("@ [#PC:X|HP 1/8]")).toHaveLength(0);
    expect(parseSession("---\nnote: [PC:X|HP 1/1]\n---")).toHaveLength(0);
  });

  it("only gives unowned items to the PC acting on the @ line", () => {
    expect(parseSession("@ [PC:A] x\n@ [Party] go\n[Inv:Torch-1]")).toHaveLength(0);
    expect(parseSession("@ [N:Guard] x\n[Inv:Torch-1]")).toHaveLength(0);
  });

  it("parses amounts", () => {
    expect(parseAmount("8->6")).toEqual({ kind: "abs", value: 6 });
    expect(parseAmount("-3")).toEqual({ kind: "delta", value: -3 });
    expect(parseAmount("2/8")).toEqual({ kind: "abs", value: 2, max: 8 });
    expect(parseAmount("depleted")).toEqual({ kind: "abs", value: 0 });
    expect(parseAmount("Invisible")).toBeNull();
  });

  it("supports custom coin names", () => {
    const coins = parseCoinMap("credits=credits, scrip = scrip");
    const out = summarize(parseSession("@ [PC:Vex] trade [Wealth:Credits-50|Scrip+2]", coins));
    expect([...out.keys()]).toEqual(["vex|wealth:credits", "vex|wealth:scrip"]);
    expect(parseSession("@ [PC:Vex] [Wealth:Gold+1]", coins)).toHaveLength(0);
  });

  it("matches singular and plural item properties", () => {
    expect(propertyCandidates("inv:torch")).toContain("torches");
    expect(propertyCandidates("inv:arrows")).toContain("arrow");
    expect(propertyCandidates("wealth:gp")).toEqual(["gp"]);
  });

  it("totals a set value plus changes after it", () => {
    expect(nums("@ [PC:N] a\n[Inv:Bolts|20]\n[Inv:Bolts-1]\n[Inv:Bolts-1]")).toEqual({ "n|inv:bolts": "abs:18" });
  });
});

describe("reconciling numbers", () => {
  const sum = (t: string) => summarize(parseSession(t));
  const shots = "@ [PC:N] shoot [Inv:Bolts-1]\n@ [PC:N] shoot [Inv:Bolts-1]";

  it("is idempotent and reversible", () => {
    const first = reconcile(sum(shots), { abs: {}, net: {} }, {}, 2);
    expect(first.changes.map((c) => c.value)).toEqual([-2]);
    const again = reconcile(sum(shots), first.memory, first.fieldSource, 2);
    expect(again.changes).toHaveLength(0);
    const third = reconcile(sum(`${shots}\n@ [PC:N] shoot [Inv:Bolts-1]`), again.memory, again.fieldSource, 2);
    expect(third.changes.map((c) => c.value)).toEqual([-1]);
    const undone = reconcile(sum("nothing"), third.memory, third.fieldSource, 2);
    expect(undone.changes.map((c) => [c.key, c.value])).toEqual([["n|inv:bolts", 3]]);
  });

  it("never lets an older session overwrite a newer value", () => {
    const newer = reconcile(sum("[PC:B|HP 2/8]"), { abs: {}, net: {} }, {}, 5);
    const older = reconcile(sum("[PC:B|HP 6/8]"), { abs: {}, net: {} }, newer.fieldSource, 4);
    expect(older.changes.filter((c) => c.field === "hp")).toHaveLength(0);
  });
});

describe("spells lost for the day", () => {
  const L = (t: string) => summarizeLists(parseListOps(t));
  const EMPTY = { set: {}, add: {}, remove: {} };

  it("parses Lost, Regain and Rest", () => {
    expect(lists("[PC:Tobin|Lost:Light]")).toEqual({ "tobin|spells_lost": "+Light/-" });
    expect(lists("[PC:B|Lost:Fog]\n[PC:B|Rest]")).toEqual({ "b|spells_lost": "set:" });
    expect(lists("[PC:B|Rest]\n[PC:B|Lost:Fog]")).toEqual({ "b|spells_lost": "set:Fog" });
    expect(lists("[PC:B|Lost:Fog]\n[PC:B|Regain:Fog]")).toEqual({ "b|spells_lost": "+/-" });
  });

  it("keeps lists and numbers separate", () => {
    expect(parseSession("[PC:B|Lost:Fog|Rest]")).toHaveLength(0);
    expect(parseListOps("[PC:B|HP 2/8]")).toHaveLength(0);
  });

  it("is idempotent, reversible and order-safe", () => {
    const first = reconcileLists(L("[PC:B|Lost:Fog]"), EMPTY, {}, 2);
    expect(first.changes.map((c) => [c.kind, c.items])).toEqual([["add", ["Fog"]]]);
    expect(reconcileLists(L("[PC:B|Lost:Fog]"), first.memory, first.fieldSource, 2).changes).toHaveLength(0);
    expect(reconcileLists(L("nothing"), first.memory, first.fieldSource, 2).changes.map((c) => [c.kind, c.items]))
      .toEqual([["remove", ["Fog"]]]);
    const rested = reconcileLists(L("[PC:B|Lost:Fog]\n[PC:B|Rest]"), first.memory, first.fieldSource, 2);
    expect(rested.changes.map((c) => [c.kind, c.items])).toEqual([["set", []]]);
    const newer = reconcileLists(L("[PC:B|Rest]"), EMPTY, {}, 3);
    expect(reconcileLists(L("[PC:B|Rest]"), EMPTY, newer.fieldSource, 2).changes).toHaveLength(0);
  });

  it("applies changes case-insensitively", () => {
    expect(applyListChange(["Fog"], { key: "", owner: "", kind: "add", items: ["fog", "Light"] })).toEqual(["Fog", "Light"]);
    expect(applyListChange(["Fog", "Light"], { key: "", owner: "", kind: "remove", items: ["FOG"] })).toEqual(["Light"]);
    expect(applyListChange(["Fog"], { key: "", owner: "", kind: "set", items: [] })).toEqual([]);
  });
});
