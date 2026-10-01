---
cssclasses:
  - lonelackey-sheet
tags:
  - character
campaign: "[[{{campaign}}]]"
status: alive
level: 1
xp: 0
xp_next: 10
ancestry:
class:
background:
hp: 1
hp_max: 1
STR: 10
DEX: 10
CON: 10
INT: 10
WIS: 10
CHA: 10
ac: 10
ac_note: ""
gp: 0
sp: 0
cp: 0
weapons: []
armor: []
spells: []
spells_lost: []
languages: []
traits: []
notes: ""
---

# {{title}}

> [!lk-identity]
> Level `= this.level` · `= default(this.ancestry, "Ancestry?")` · `= default(this.class, "Class?")` · `= default(this.background, "Background?")`

> [!lk-vitals]
> | HP | AC | Level | XP |
> |:-:|:-:|:-:|:-:|
> | `INPUT[number:hp]` / `VIEW[{hp_max}]` | `VIEW[{ac}]` | `VIEW[{level}]` | `INPUT[number:xp]` / `VIEW[{xp_next}]` |

> [!lk-stats]
> | STR | DEX | CON | INT | WIS | CHA |
> |:-:|:-:|:-:|:-:|:-:|:-:|
> | `VIEW[{STR}]` | `VIEW[{DEX}]` | `VIEW[{CON}]` | `VIEW[{INT}]` | `VIEW[{WIS}]` | `VIEW[{CHA}]` |
> | `VIEW[floor(({STR} - 10) / 2)]` | `VIEW[floor(({DEX} - 10) / 2)]` | `VIEW[floor(({CON} - 10) / 2)]` | `VIEW[floor(({INT} - 10) / 2)]` | `VIEW[floor(({WIS} - 10) / 2)]` | `VIEW[floor(({CHA} - 10) / 2)]` |

> [!lk-build]- Build
> - **Ancestry** `INPUT[suggester(optionQuery(#ancestry)):ancestry]`
> - **Class** `INPUT[suggester(optionQuery(#class)):class]`
> - **Background** `INPUT[suggester(optionQuery(#background)):background]`
>
> - **Level** `INPUT[number:level]`
> - **Max HP** `INPUT[number:hp_max]`
> - **AC** `INPUT[number:ac]`
> - **AC breakdown** `INPUT[text:ac_note]`
> - **XP to next level** `INPUT[number:xp_next]`
>
> - **STR** `INPUT[number:STR]`
> - **DEX** `INPUT[number:DEX]`
> - **CON** `INPUT[number:CON]`
> - **INT** `INPUT[number:INT]`
> - **WIS** `INPUT[number:WIS]`
> - **CHA** `INPUT[number:CHA]`
>
> - **Weapons** `INPUT[inlineListSuggester(optionQuery(#weapon)):weapons]`
> - **Armor** `INPUT[inlineListSuggester(optionQuery(#armor)):armor]`
> - **Spells** `INPUT[inlineListSuggester(optionQuery(#spell)):spells]`
> - **Lost until rest** `INPUT[inlineList:spells_lost]`
> - **Languages** `INPUT[inlineList:languages]`
> - **Traits** `INPUT[inlineList:traits]`

> [!lk-grid]
> > [!lk-class] Class
> > `= default(this.class, "Pick a class in the Build panel.")`
> >
> > ```dataview
> > LIST WITHOUT ID f
> > FROM #character
> > WHERE file.path = this.file.path
> > FLATTEN class.features AS f
> > ```
>
> > [!lk-attacks] Attacks
> > **Melee** STR `VIEW[floor(({STR} - 10) / 2)]` · **Ranged** DEX `VIEW[floor(({DEX} - 10) / 2)]`
> >
> > ```dataview
> > TABLE WITHOUT ID w AS Weapon, w.damage AS Damage, w.range AS Range, w.traits AS Traits
> > FROM #character
> > WHERE file.path = this.file.path
> > FLATTEN weapons AS w
> > ```
>
> > [!lk-coin] Wealth
> > **GP** `INPUT[number:gp]` · **SP** `INPUT[number:sp]` · **CP** `INPUT[number:cp]`
>
> > [!lk-gear] Equipment
> > **AC** `VIEW[{ac}]` — `VIEW[{ac_note}][text]`
> >
> > ```dataview
> > TABLE WITHOUT ID a AS Armor, a.ac AS AC, a.traits AS Traits
> > FROM #character
> > WHERE file.path = this.file.path
> > FLATTEN armor AS a
> > ```
> >
> > -
>
> > [!lk-talents] Abilities
> > **Ancestry** `= default(this.ancestry.feature, "—")`
> >
> > -
>
> > [!lk-allies] Companions
> > -
>
> > [!lk-lore] Languages & Traits
> > **Languages** `= choice(length(this.languages) > 0, join(this.languages, ", "), "—")`
> > **Traits** `= choice(length(this.traits) > 0, join(this.traits, ", "), "—")`

> [!lk-spells] Spells
> **Lost until rest** `= choice(length(default(this.spells_lost, list())) > 0, join(this.spells_lost, ", "), "—")`
>
> ```dataview
> TABLE WITHOUT ID s AS Spell, choice(contains(map(default(spells_lost, list()), (x) => lower(x)), lower(default(s.file.name, ""))), "Lost", "Ready") AS Status, s.level AS Level, s.range AS Range, s.duration AS Duration, s.summary AS Effect
> FROM #character
> WHERE file.path = this.file.path
> FLATTEN spells AS s
> SORT s.level ASC
> ```

> [!lk-log] Session Log
> ```dataview
> LIST
> FROM #session AND [[]] AND -"Templates"
> SORT session ASC
> ```

> [!lk-notes] Notes
> `INPUT[textArea:notes]`
