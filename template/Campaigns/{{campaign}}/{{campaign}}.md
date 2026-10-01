---
tags:
  - campaign
system:
started:
status: active
---

# {{campaign}}

> [!lk-ref] Campaign
> What this campaign is about, in a sentence or two.

## Party
```dataview
TABLE WITHOUT ID file.link AS Character, level AS Lvl, ancestry AS Ancestry, class AS Class, hp + " / " + hp_max AS HP, ac AS AC, gp AS GP
FROM (#character AND [[]]) AND -"Templates"
WHERE status = "alive"
SORT file.name ASC
```

## Sessions
```dataview
TABLE WITHOUT ID session AS "#", file.link AS Session, played AS Played, characters AS Characters
FROM (#session AND [[]]) AND -"Templates"
SORT session ASC
```

## World
```dataview
TABLE WITHOUT ID file.link AS Name, choice(contains(file.tags, "#npc"), "NPC", choice(contains(file.tags, "#location"), "Location", "Faction")) AS Type, status AS Status
FROM ((#npc OR #location OR #faction) AND [[]]) AND -"Templates"
SORT Type ASC, file.name ASC
```

## Fallen
```dataview
TABLE WITHOUT ID file.link AS Character, level AS Lvl, died_in AS Session, died_at AS Where, fate AS Fate
FROM (#character AND [[]]) AND -"Templates"
WHERE status = "dead"
SORT file.name ASC
```

## Threads
See [[Threads]].
