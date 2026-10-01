# How to build your compendium

The character sheet pulls details from notes you write here: class features, weapon damage, spell ranges and so on. Lonelackey doesn't ship any game's rules, so this folder starts empty. Add only what you need, from the game you're playing.

Each kind of entry is **one note per thing** (one note per spell, per weapon…) with a **tag** so the sheet can find it, and a few **properties** the sheet reads. Anything else you put in the note is just for you.

> [!lk-ref] Copyright
> Keep entries short and in your own words, and only for personal use unless your game's license allows sharing. Many publishers let you reference their rules but not reprint them.

## Classes → `Compendium/Classes/`
Tag `class`. Shown in the sheet's **Class** panel.

```yaml
---
tags:
  - class
features:
  - "**Feature name.** What it does, briefly."
  - "**Another feature.** What it does."
---
```

## Ancestries → `Compendium/Ancestries/`
Tag `ancestry`. The `feature` line appears in the sheet's **Abilities** panel.

```yaml
---
tags:
  - ancestry
feature: "Feature name: what it does."
languages:
  - Common
---
```

## Backgrounds → `Compendium/Backgrounds/`
Tag `background`.

```yaml
---
tags:
  - background
summary: "One line about this background."
---
```

## Spells → `Compendium/Spells/`
Tag `spell`. Every column in the sheet's **Spells** table comes from these.

```yaml
---
tags:
  - spell
level: 1
range: "Near"
duration: "Instant"
summary: "What the spell does, in one line."
---
```

## Weapons → `Compendium/Gear/Weapons/`
Tag `weapon`. Shown in the sheet's **Attacks** table.

```yaml
---
tags:
  - weapon
damage: "1d6"
range: "Close"
traits: "Two-handed"
---
```

## Armor → `Compendium/Gear/Armor/`
Tag `armor`. Shown in the sheet's **Equipment** panel.

```yaml
---
tags:
  - armor
ac: "+2"
traits: "Noisy"
---
```

## Using entries on a sheet
Open a character's **Build** panel. The Class, Ancestry and Background pickers list notes with those tags; Weapons, Armor and Spells let you pick several. Links work in both directions: each entry can list who uses it with

````
```dataview
LIST FROM #character AND [[]]
```
````

## Adding your own kinds
Any tag works the same way. For example, tag notes `talent` and add a picker to the Character template's Build panel:
`INPUT[inlineListSuggester(optionQuery(#talent)):talents]`
