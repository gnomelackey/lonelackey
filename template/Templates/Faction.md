---
tags:
  - faction
campaign: "[[{{campaign}}]]"
status: active
standing: neutral
---

# {{title}}

> [!lk-ref] Faction
> **Status** `INPUT[inlineSelect(option(active), option(weakened), option(destroyed), option(unknown)):status]` · **Standing** `INPUT[inlineSelect(option(allied), option(friendly), option(neutral), option(wary), option(hostile)):standing]`

## Goals


## Resources


## Members
```dataview
LIST FROM #npc AND [[]] AND -"Templates"
```

## Appearances
```dataview
LIST FROM #session AND [[]] AND -"Templates"
SORT session ASC
```
