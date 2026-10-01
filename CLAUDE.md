# Lonelackey

Obsidian plugin (TypeScript) for solo/group TTRPG journaling. Users write session notes in **Lonelog** notation; Lonelackey reads the tags on save and updates character-sheet frontmatter (HP, XP, ammo, coins, spells lost). It also ships a **starter vault** (templates, dashboards, sheet CSS, empty compendium) embedded in `main.js`.

Author: GnomeLackey. MIT. Plugin id `lonelackey`, display name `Lonelackey`. Intended for public release (Obsidian community plugins / GitHub).

## Hard rules
- **System-agnostic.** No rules, stats, classes, spells, gear or text from any published game (Shadowdark included) in code, tests, template or docs. Use generic names in examples (Mira, Tobin, "Light", "Fog", Arrows, Rope).
- **No script execution in notes.** Templates must work with Dataview *query language* (DataviewJS off) and Meta Bind with JS off. No Templater. Placeholders in templates are only Obsidian core Templates `{{title}}` / `{{date}}`, plus our build-time `{{campaign}}`.
- **Never destroy user data.** Writes to sheets go through `app.fileManager.processFrontMatter`. Scaffolding never overwrites existing files. Only numeric properties that already exist on a sheet are written; `spells_lost` is the single property we may create.
- Keep `src/core.ts` free of Obsidian imports so it stays unit-testable.

## Commands
```bash
npm install
npm run build       # tsc --noEmit → eslint → esbuild --production; writes dist/
npm run dev         # esbuild watch (inline sourcemaps)
npm test            # vitest run
npm run lint        # eslint (type-aware); lint:fix to autofix
npm run typecheck
```
`OBSIDIAN_VAULT=<vault path>` copies the built plugin into that vault's `.obsidian/plugins/lonelackey/` after every build (PowerShell: `$env:OBSIDIAN_VAULT = "C:\path\Vault"; npm run dev`). Dev machine is Windows; keep scripts path-safe (`fileURLToPath`, `path.join`, paths with spaces).

Before finishing any change: `npm run build` and `npm test` must both pass with zero lint errors.

## Layout
```
src/core.ts        pure logic: tag parsing, summarizing, idempotent reconcile (numbers + lists)
src/main.ts        Plugin: on-save sync (metadataCache "changed" + per-file debounce + promise queue),
                   rename tracking, commands, applying Changes to sheets, persisted state
src/settings.ts    LonelackeySettings, DEFAULT_SETTINGS, LonelackeySettingTab
src/scaffold.ts    "Create starter vault": writes TEMPLATE_FILES via vault.adapter (can write .obsidian/), never overwrites
src/virtual.d.ts   types for `virtual:template`
template/          the starter vault source (see below)
test/core.test.ts  Vitest, synthetic fixtures only
esbuild.config.mjs bundle + `lonelackey-template` (virtual module) + `lonelackey-assemble` (dist layout) plugins
manifest.json / versions.json / package.json   keep versions in sync on release
```

### Build output
- `dist/obsidian/lonelackey/` — `main.js`, `manifest.json` (+ `styles.css` if a root `styles.css` exists)
- `dist/vault-template/` — template with `{{campaign}}` → "My Campaign" and the plugin preinstalled
- `template/**/.gitkeep` marks an empty folder; it becomes `{ path: "dir/", content: null }` in `TEMPLATE_FILES`.

## Sync model (read before touching core.ts or main.ts)
- Session notes = notes tagged `#session` (setting `sessionTag`; nested tags count). Character sheets = tag `character`, matched to `[PC:Name]` by note basename (case-insensitive), narrowed by the `campaign` frontmatter link when both sides set one.
- Session order = `session` frontmatter number, else first number in the file name.
- Each tag produces an `Op` keyed `"owner|field"` (owner lower-cased). Fields: `hp`, `hp_max`, `xp`, any `name`/`name_max` pair, `inv:<item>`, `wealth:<prop>`.
- `summarize` folds ops per key: an absolute sets the value and later deltas add to it (`mode: "abs"`); deltas only → `mode: "delta"` with a net total.
- `reconcile(results, memory, fieldSource, sessionNumber)` compares against what *this session* applied last time (`state.sessions[path]`):
  - absolute changed → `set`, but only if `sessionNumber >= fieldSource[key]` (older sessions never overwrite newer absolutes)
  - delta net changed → `adjust` by the difference; a deleted delta tag is reversed
  - re-saving an unchanged note → no changes (idempotent)
- Lists (`spells_lost`): `Lost:X` add, `Regain:X` remove, `Rest` clear; same per-session memory + fieldSource guard; matching is case-insensitive.
- `propertyCandidates("inv:torch")` → tries `torch`, `torches`, etc. Item counters map to existing sheet properties only.
- Persisted plugin data: `{ settings, state: { sessions: Record<path, memory>, fieldSource } }`. Renames move the session's memory. "Mark this session as already applied" records memory without touching sheets (used when importing logs).

## Lonelog grammar we read
```
@ [PC:Mira|HP 7/9|Luck 1/1] action       @ starts an action line; sets the "acting PC"
[PC:Mira|HP-3]  [PC:Mira|XP+1]  [PC:Mira|HP 9->7]  [PC:Mira|Ammo depleted]
[Inv:Arrows-1]  [Inv:Rope|1]  [Inv:Torch x3]  [Inv:Torch-1|@Tobin]
[Wealth:Gold-5|Silver+2]  [Wealth:Gold 20]       coin names → props via `coins` setting (gold=gp, ...)
[PC:Tobin|Lost:Light]  [PC:Tobin|Regain:Light]  [PC:Tobin|Rest]
[#PC:Mira]                                         reference — never changes anything
? oracle   d: roll   => consequence                other Lonelog line types; not synced
```
- Unowned `[Inv:]`/`[Wealth:]` go to the PC on the most recent `@ [PC:X]` line. `@ [N:..]`, `@ [F:..]`, `@ [Party]` clear the actor; use `|@Name` instead.
- Frontmatter and fenced code blocks are skipped.
- Key regexes live at the top of `core.ts` (`PC_TAG`, `INV_TAG`, `WEALTH_TAG`, `ACTION_ACTOR`); change them together with tests.

## Starter vault (`template/`)
```
Home.md                               dashboard, setup steps, tag cheat sheet
Campaigns/{{campaign}}/{{campaign}}.md hub (party, sessions, world, fallen)
Campaigns/{{campaign}}/Threads.md     clocks + hooks
Campaigns/{{campaign}}/{Characters,Characters/Fallen,Sessions,World/NPCs,World/Locations,World/Factions}/
Compendium/How to build your compendium.md + empty Classes, Ancestries, Backgrounds, Spells, Gear/Weapons, Gear/Armor
Templates/{Character,Session,NPC,Location,Faction}.md
Assets/{Images,Maps}/
.obsidian/{templates.json, appearance.json, community-plugins.json, snippets/lonelackey-sheet.css}
```
- Character sheets use `cssclasses: [lonelackey-sheet]` and callouts prefixed `lk-` (`[!lk-identity]`, `[!lk-gear]`, `[!lk-build]`, …; styled in `lonelackey-sheet.css`); CSS variables are `--lk-*`.
- Dataview: query language only. Exclude templates with `FROM ... AND -"Templates"`. Prefer `default()`/`choice()` to guard nulls.
- **Meta Bind (1.5.x) inline types allowed:** toggle, slider, text, textArea, date, time, datePicker, number, suggester, imageSuggester, inlineSelect, inlineListSuggester, inlineList, dateTime. `listSuggester`, `list`, `select` etc. are **block-only** — using them inline errors. `VIEW[{prop}]` math is fine; no JS views.

## Code style
- TypeScript strict, ES2021, `moduleResolution: Bundler`, no unused locals/params.
- ESLint flat config: `typescript-eslint` `recommendedTypeChecked` with projectService. Avoid `any`, unnecessary assertions, floating promises (`void` them deliberately), base-to-string.
- Small, explicit functions; comments explain *why*. User-facing strings in plain language (notices, command names, settings).
- New behavior in `core.ts` needs a Vitest case. Tests use synthetic names and generic items only.

## Releasing
Bump `version` in `manifest.json` and `package.json`, add `"<version>": "<minAppVersion>"` to `versions.json`, `npm run build`, attach `dist/obsidian/lonelackey/main.js` and `manifest.json` to a GitHub release tagged with the bare version (no `v`).

## Possible next work (not started)
- Rest also restoring HP / per-day resources (configurable).
- "Export session for blog" command (strip mechanics into readable prose scaffold).
- Optional `styles.css` for plugin UI (the sheet CSS stays a vault snippet).
