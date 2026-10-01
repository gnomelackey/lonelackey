import { App, CachedMetadata, Editor, FuzzySuggestModal, Notice, Plugin, TFile, getAllTags } from "obsidian";
import {
  Change, CoinMap, LOST_FIELD, ListChange, ListMemory, SessionMemory, applyListChange, parseCoinMap, parseListOps,
  parseSession, propertyCandidates, reconcile, reconcileLists, summarize, summarizeLists,
} from "./core";
import { DEFAULT_SETTINGS, LonelackeySettingTab, LonelackeySettings } from "./settings";
import { ScaffoldModal } from "./scaffold";

type StoredMemory = SessionMemory & { lists?: ListMemory };
type Frontmatter = Record<string, unknown>;

interface SyncState {
  /** What each session note applied last time, keyed by its path. */
  sessions: Record<string, StoredMemory>;
  /** "owner|field" → number of the session that last set it outright (so older sessions can't overwrite newer ones). */
  fieldSource: Record<string, number>;
}

interface PluginData { settings: LonelackeySettings; state: SyncState }

const EMPTY_LISTS = (): ListMemory => ({ set: {}, add: {}, remove: {} });
const fmOf = (cache: CachedMetadata | null | undefined): Frontmatter => (cache?.frontmatter ?? {});

/** "[[Folder/Name|Alias]]" → "name", for comparing campaign links. */
const linkText = (v: unknown): string =>
  typeof v === "string" ? (v.replace(/^\[\[|\]\]$/g, "").split("|")[0].split("/").pop() ?? "").trim().toLowerCase() : "";

export default class LonelackeyPlugin extends Plugin {
  settings: LonelackeySettings = { ...DEFAULT_SETTINGS };
  private state: SyncState = { sessions: {}, fieldSource: {} };
  private coins: CoinMap = parseCoinMap(DEFAULT_SETTINGS.coins);
  private timers = new Map<string, number>();
  private queue: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    const data = (await this.loadData()) as Partial<PluginData> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data?.settings ?? {}) };
    this.state = { sessions: {}, fieldSource: {}, ...(data?.state ?? {}) };
    this.coins = parseCoinMap(this.settings.coins);

    // Fires after a note is saved and Obsidian has re-read its properties.
    this.registerEvent(this.app.metadataCache.on("changed", (file, content, cache) => {
      if (!this.settings.autoSync || !this.isSession(cache)) return;
      window.clearTimeout(this.timers.get(file.path));
      this.timers.set(file.path, window.setTimeout(() => {
        this.timers.delete(file.path);
        void this.syncSession(file, content, cache, false);
      }, this.settings.delayMs));
    }));

    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const moved = this.state.sessions[oldPath];
      if (!moved) return;
      this.state.sessions[file.path] = moved;
      delete this.state.sessions[oldPath];
      void this.persist();
    }));

    this.addCommand({
      id: "sync-current-session",
      name: "Sync this session now",
      checkCallback: (checking) => this.withActiveSession(checking, (file, content, cache) =>
        this.syncSession(file, content, cache, true)),
    });

    this.addCommand({
      id: "sync-all-sessions",
      name: "Sync all sessions",
      callback: () => { void this.syncAll(); },
    });

    this.addCommand({
      id: "mark-session-synced",
      name: "Mark this session as already applied (no changes to sheets)",
      checkCallback: (checking) => this.withActiveSession(checking, (file, content, cache) =>
        this.markApplied(file, content, cache)),
    });

    this.addCommand({
      id: "insert-pc-status",
      name: "Insert PC status tag",
      editorCallback: (editor) => this.insertStatus(editor),
    });

    this.addCommand({
      id: "create-starter-vault",
      name: "Create starter vault (folders, templates, sheet style, compendium guide)",
      callback: () => new ScaffoldModal(this.app).open(),
    });

    this.addSettingTab(new LonelackeySettingTab(this.app, this));
  }

  onunload(): void {
    for (const t of this.timers.values()) window.clearTimeout(t);
  }

  async saveSettings(): Promise<void> {
    this.coins = parseCoinMap(this.settings.coins);
    await this.persist();
  }

  // ── Helpers ──────────────────────────────────────────────────

  private withActiveSession(
    checking: boolean,
    run: (file: TFile, content: string, cache: CachedMetadata) => Promise<void>,
  ): boolean {
    const file = this.app.workspace.getActiveFile();
    const cache = file ? this.app.metadataCache.getFileCache(file) : null;
    if (!file || !cache || !this.isSession(cache)) return false;
    if (!checking) void this.app.vault.read(file).then((content) => run(file, content, cache));
    return true;
  }

  private hasTag(cache: CachedMetadata | null | undefined, tag: string): boolean {
    if (!cache) return false;
    const want = `#${tag.replace(/^#/, "").toLowerCase()}`;
    return (getAllTags(cache) ?? []).some((t) => {
      const lower = t.toLowerCase();
      return lower === want || lower.startsWith(`${want}/`);
    });
  }

  private isSession(cache: CachedMetadata | null | undefined): boolean {
    return this.hasTag(cache, this.settings.sessionTag);
  }

  private sessionNumber(file: TFile, cache: CachedMetadata): number {
    const n = Number(fmOf(cache).session);
    if (Number.isFinite(n)) return n;
    const m = file.basename.match(/(\d+)/);
    return m ? Number(m[1]) : 0;
  }

  /** Character notes by lower-cased name, limited to the session's campaign when both sides set one. */
  private characters(campaign: string): Map<string, TFile> {
    const out = new Map<string, TFile>();
    for (const f of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(f);
      if (!this.hasTag(cache, this.settings.characterTag)) continue;
      const theirs = linkText(fmOf(cache).campaign);
      if (campaign && theirs && theirs !== campaign) continue;
      out.set(f.basename.toLowerCase(), f);
    }
    return out;
  }

  private async persist(): Promise<void> {
    const data: PluginData = { settings: this.settings, state: this.state };
    await this.saveData(data);
  }

  // ── Sync ─────────────────────────────────────────────────────

  /** Syncs run one at a time, in the order they were requested. */
  syncSession(file: TFile, content: string, cache: CachedMetadata, manual: boolean): Promise<void> {
    this.queue = this.queue.then(() => this.runSync(file, content, cache, manual));
    return this.queue;
  }

  private async runSync(file: TFile, content: string, cache: CachedMetadata, manual: boolean): Promise<void> {
    try {
      const n = this.sessionNumber(file, cache);
      const memory: StoredMemory = this.state.sessions[file.path] ?? { abs: {}, net: {} };
      const nums = reconcile(summarize(parseSession(content, this.coins)), memory, this.state.fieldSource, n);
      const lists = reconcileLists(summarizeLists(parseListOps(content)), memory.lists ?? EMPTY_LISTS(), nums.fieldSource, n);

      const report = await this.apply(nums.changes, lists.changes, linkText(fmOf(cache).campaign));

      this.state.sessions[file.path] = { ...nums.memory, lists: lists.memory };
      this.state.fieldSource = lists.fieldSource;
      await this.persist();

      if (this.settings.showNotices && (report.lines.length || manual)) {
        const body = report.lines.length ? report.lines.join("\n") : "Nothing to update.";
        const skipped = report.skipped.length ? `\nNo matching sheet field: ${[...new Set(report.skipped)].join(", ")}` : "";
        new Notice(`Lonelackey · ${file.basename}\n${body}${skipped}`, 6000);
      }
    } catch (e) {
      console.error("Lonelackey", e);
      new Notice(`Lonelackey failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async apply(changes: Change[], listChanges: ListChange[], campaign: string): Promise<{ lines: string[]; skipped: string[] }> {
    const lines: string[] = [];
    const skipped: string[] = [];
    const sheets = this.characters(campaign);
    const byOwner = new Map<string, { nums: Change[]; lists: ListChange[] }>();
    const slot = (owner: string) => {
      const key = owner.toLowerCase();
      let entry = byOwner.get(key);
      if (!entry) { entry = { nums: [], lists: [] }; byOwner.set(key, entry); }
      return entry;
    };
    for (const c of changes) slot(c.owner).nums.push(c);
    for (const c of listChanges) slot(c.owner).lists.push(c);

    for (const [owner, { nums, lists }] of byOwner) {
      const file = sheets.get(owner);
      if (!file) {
        skipped.push(...nums.map((c) => `${c.owner} ${c.field}`), ...lists.map((c) => `${c.owner} spells`));
        continue;
      }
      const parts: string[] = [];
      await this.app.fileManager.processFrontMatter(file, (raw: unknown) => {
        const fm = raw as Frontmatter;

        // Spells lost for the day — the property is created if the sheet doesn't have it yet.
        for (const c of lists) {
          const current = fm[LOST_FIELD];
          const before = Array.isArray(current) ? current.map((x) => String(x)) : [];
          const after = applyListChange(before, c);
          if (JSON.stringify(after) === JSON.stringify(before)) continue;
          fm[LOST_FIELD] = after;
          if (c.kind === "set") parts.push(after.length ? `spells lost: ${after.join(", ")}` : "rested, all spells back");
          else if (c.kind === "add") parts.push(`lost ${c.items.join(", ")}`);
          else parts.push(`regained ${c.items.join(", ")}`);
        }

        // Numbers — only properties the sheet already has are touched.
        for (const c of nums) {
          const prop = propertyCandidates(c.field).find((p) => Object.prototype.hasOwnProperty.call(fm, p));
          if (!prop) { skipped.push(`${file.basename} ${c.field.replace(/^(inv|wealth):/, "")}`); continue; }
          const before = Number(fm[prop]) || 0;
          const after = Math.max(0, c.kind === "set" ? c.value : before + c.value);
          if (after === before) continue;
          fm[prop] = after;
          parts.push(`${prop} ${before}→${after}`);
        }
      });
      if (parts.length) lines.push(`${file.basename}: ${parts.join(", ")}`);
    }
    return { lines, skipped };
  }

  async syncAll(): Promise<void> {
    const sessions = this.app.vault.getMarkdownFiles()
      .map((f) => ({ f, c: this.app.metadataCache.getFileCache(f) }))
      .filter((x): x is { f: TFile; c: CachedMetadata } => !!x.c && this.isSession(x.c))
      .sort((a, b) => this.sessionNumber(a.f, a.c) - this.sessionNumber(b.f, b.c));
    for (const { f, c } of sessions) await this.syncSession(f, await this.app.vault.read(f), c, false);
    new Notice(`Lonelackey: checked ${sessions.length} session${sessions.length === 1 ? "" : "s"}.`);
  }

  async markApplied(file: TFile, content: string, cache: CachedMetadata): Promise<void> {
    const n = this.sessionNumber(file, cache);
    const nums = reconcile(summarize(parseSession(content, this.coins)), { abs: {}, net: {} }, this.state.fieldSource, n);
    const lists = reconcileLists(summarizeLists(parseListOps(content)), EMPTY_LISTS(), nums.fieldSource, n);
    this.state.sessions[file.path] = { ...nums.memory, lists: lists.memory };
    this.state.fieldSource = lists.fieldSource;
    await this.persist();
    new Notice(`Lonelackey: ${file.basename} marked as applied. Sheets were not changed.`);
  }

  // ── Insert PC status ─────────────────────────────────────────

  /** Inserts [PC:Name|HP 5/8|…] using every value/max pair on the chosen sheet. */
  private insertStatus(editor: Editor): void {
    const active = this.app.workspace.getActiveFile();
    const campaign = active ? linkText(fmOf(this.app.metadataCache.getFileCache(active)).campaign) : "";
    const living = [...this.characters(campaign).values()].filter((f) => {
      const status = fmOf(this.app.metadataCache.getFileCache(f)).status;
      return typeof status !== "string" || status.toLowerCase() !== "dead";
    });
    if (!living.length) { new Notice("Lonelackey: no living characters found for this campaign."); return; }

    new CharacterPicker(this.app, living, (file) => {
      const fm = fmOf(this.app.metadataCache.getFileCache(file));
      const label = (key: string) => (key === "hp" ? "HP" : key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()));
      const pairs = Object.keys(fm)
        .filter((k) => k.endsWith("_max") && typeof fm[k.slice(0, -4)] === "number")
        .map((k) => k.slice(0, -4))
        .sort((a, b) => (a === "hp" ? -1 : b === "hp" ? 1 : 0));
      const fields = pairs.map((k) => `${label(k)} ${String(fm[k])}/${String(fm[`${k}_max`])}`);
      editor.replaceSelection(`[PC:${file.basename}${fields.length ? `|${fields.join("|")}` : ""}]`);
    }).open();
  }
}

class CharacterPicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private files: TFile[], private onPick: (f: TFile) => void) {
    super(app);
    this.setPlaceholder("Which character?");
  }
  getItems(): TFile[] { return this.files; }
  getItemText(f: TFile): string { return f.basename; }
  onChooseItem(f: TFile): void { this.onPick(f); }
}
