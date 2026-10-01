# Home

> [!lk-ref] Start here
> - **Play:** [[{{campaign}}]] — campaign hub: party, sessions, world, threads
> - **Look up:** [[How to build your compendium]]

## First-time setup
1. **Settings → Community plugins:** install and enable **Dataview** and **Meta Bind** (the sheets use both; no JavaScript needed). **Lonelog** is optional but recommended for writing sessions.
2. **Settings → Appearance → CSS snippets:** refresh and enable **lonelackey-sheet**.
3. **Settings → Templates:** set the template folder to `Templates`.
4. Fill in your game's rules in `Compendium/` — see [[How to build your compendium]].
5. Create a character: new note in `Campaigns/{{campaign}}/Characters/`, then **Templates: Insert template → Character**. Open its **Build** panel to fill it in.

## Writing sessions
New note in `Campaigns/{{campaign}}/Sessions/` → **Insert template → Session**. Lonelackey updates character sheets from these tags a moment after you save:

| Write in a session | What the sheet does |
|---|---|
| `[PC:Mira\|HP 7/9]` | Sets HP and max HP |
| `[PC:Mira\|HP-3]` · `[PC:Mira\|XP+1]` | Changes a value |
| `[PC:Mira\|Stress 2/6]` | Any value/max pair the sheet has (add `stress` and `stress_max` properties) |
| `[Inv:Arrows-1]` · `[Inv:Rope\|1]` | Changes or sets a counter on the acting PC's sheet (needs an `arrows` property) |
| `[Inv:Torch-1\|@Tobin]` | Same, for a named PC (use on `[Party]` lines) |
| `[Wealth:Gold-5]` · `[Wealth:Gold 20]` | Coins (names → properties in Lonelackey settings) |
| `[PC:Tobin\|Lost:Light]` · `Regain:Light` · `Rest` | Spells lost until rest |
| `[#PC:Mira]` | A mention only — never changes anything |

**Insert PC status tag** (command palette) writes a tag with a character's current values.

## Latest sessions
```dataview
TABLE WITHOUT ID file.link AS Session, campaign AS Campaign, played AS Played
FROM #session AND -"Templates"
SORT played DESC
LIMIT 5
```

## Open threads
```dataview
TASK
FROM "Campaigns"
WHERE !completed
GROUP BY file.link
```
