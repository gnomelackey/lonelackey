---
tags:
  - location
campaign: "[[{{campaign}}]]"
status: unexplored
region: 
first_seen: 
---

# {{title}}

> [!lk-ref] Location
> **Status** `INPUT[inlineSelect(option(unexplored), option(explored), option(cleared), option(lost)):status]` · **Region** `INPUT[suggester(optionQuery(#location)):region]` · **First seen** `INPUT[suggester(optionQuery(#session)):first_seen]`

## Description


## Rumors
- [ ] 

## Who's here
```dataview
LIST FROM #npc AND [[]] AND -"Templates"
```

## Appearances
```dataview
LIST FROM #session AND [[]] AND -"Templates"
SORT session ASC
```
