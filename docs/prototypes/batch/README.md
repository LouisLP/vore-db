# Prototype: a Batch for three Japanese Items

A throwaway asset for [Batch file and review workflow (#21)](https://github.com/LouisLP/vore-db/issues/21).
`catalogue/` here mirrors the layout the real one will have at the repo root. The values
are real Wikidata and Commons facts, fetched 2026-10-11. Descriptions are written fresh
(ADR-0007).

| File | Shows |
| --- | --- |
| `items/Q701075.yaml` okonomiyaki | accepted; human-rewritten drafted description (≠ `_upstream`) |
| `items/Q235169.yaml` miso | pending, untouched; `drafted` lists what review must check |
| `items/Q822331.yaml` matcha | accepted; Wikidata says CN, human added JP as primary origin |
| `_upstream/*.json` | machine-owned snapshot the three-way merge diffs against (collapsed in PRs). Miso's is omitted because it would equal its Item file. |
| `rejections.yaml` | global Rejection list, one entry |

## Run report (PR description, not checked in)

What `catalogue:run japan` would print if Wikidata had since changed matcha's image and
okonomiyaki's description source:

```
catalogue:run japan: 3 candidates (1 new, 2 unchanged, 0 gone), 1 rejected skipped

Upstream moved under a human edit (human value kept):
  Q701075 okonomiyaki  description
    was:  A Japanese savoury pancake made with flour, eggs and cabbage, ...
    now:  A Japanese savoury pancake of batter and cabbage, ...
    kept: A savoury pancake of batter and shredded cabbage cooked on a griddle, ...

Refreshed (no human edit):
  Q822331 matcha  images[75618459].url

Pending review: 1  (Q235169 miso: drafted description, category, tags)
```

## Merge rule, in one table

Per field, and per element (keyed as below) for collections:

| upstream before | upstream now | in the file | result |
| --- | --- | --- | --- |
| A | A | A | A |
| A | B | A | B (source moved, no human edit) |
| A | B | H | H (human wins, reported) |
| — | B | — | B (new from source) |
| A | — | A | removed (source dropped it) |
| — | — | H | H (human added) |
| A | A or B | — | stays removed (human removed) |

Element keys: Alias `lower(value)`, Image `commonsPageId` (else `url`), Country `(code, role)`,
Tag Slug, External id `(scheme, value)`.
