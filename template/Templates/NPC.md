---
tags:
  - npc
campaign: "[[{{campaign}}]]"
status: alive
disposition: neutral
location: 
first_seen: 
---

# {{title}}

> [!lk-ref] NPC
> **Status** `INPUT[inlineSelect(option(alive), option(dead), option(missing), option(unknown)):status]` · **Disposition** `INPUT[inlineSelect(option(friendly), option(neutral), option(wary), option(hostile)):disposition]`
> **Location** `INPUT[suggester(optionQuery(#location)):location]` · **First seen** `INPUT[suggester(optionQuery(#session)):first_seen]`

## Description


## Wants


## Secrets


## Appearances
```dataview
LIST FROM #session AND [[]] AND -"Templates"
SORT session ASC
```
