---
status: accepted
---

# Country is the only origin axis, keyed by its ISO code

An item's origin points at a `country` row and nothing else. The table holds only current ISO 3166-1 entries, seeded verbatim from the reference list and never hand-edited, with the alpha-2 code as the primary key rather than a surrogate id. Because the table is closed and every row is guaranteed a code, the code can safely carry identity: joins read as `country_code = 'JP'`, URLs are `/country/jp` with no lookup, and the foreign key is two bytes.

## Considered options

**A general `place` table** with a `kind` discriminator and a self-referencing parent, so that "Basque", "Cantonese" and "Levantine" could be rows alongside countries. Rejected as more machinery than the primary use — browse and filter by country — actually needs. Culinary geography is expressed through multi-country origin instead: "Levantine" is Lebanon, Syria and Jordan.

**Separate `country` and `cuisine` tables.** Rejected: it doubles the joins and duplicates overlapping rows ("Japan" the country against "Japanese" the cuisine).

**Historical rows for vanished states** — Yugoslavia, the Ottoman Empire — with null codes and validity ranges. Rejected because it makes the table un-seedable from a canonical list, forces a surrogate key, and makes every query decide whether defunct rows count. Ćevapi is attributed to Bosnia, Serbia and Croatia, which is what multi-country origin is for.

## Consequences

Adding a cuisine or culture axis later is purely additive — a new table and a new join — and does not disturb anything decided here.

If the ISO-only rule is ever relaxed, the natural key has to go with it. That is a deliberate trade: the key is cheap and readable precisely because the rule is strict.
