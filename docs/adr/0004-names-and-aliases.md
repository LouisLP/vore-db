---
status: accepted
---

# One canonical name on the item, every other name a row

`item.name` stays a single column holding the one canonical English display name, and a separate `item_name` table holds every other name the item goes by — native script, romanisation, regional synonym, historical name. Each of those rows carries a `kind` and an optional BCP 47 language tag. Names are unique within an item and freely repeated across items; `slug` remains the globally unique handle.

```
name_kind  enum ('native', 'romanisation', 'synonym', 'historical')

item_name
  id       <surrogate key, type per the open table-conventions decision>
  item_id  -> item.id  on delete cascade  not null
  value    text       not null
  kind     name_kind  not null
  lang     text       null      -- BCP 47: 'ja', 'ja-Latn', 'en-GB'

  check (length(btrim(value)) > 0)
  check (lang is null or lang ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$')

create unique index on item_name (item_id, lower(value));
-- + constraint trigger: item_name.value never restates its item's name,
--   fired on item_name insert/update and on item.name update
```

Splitting the kind from the language is what makes 寿司 and *sushi* distinguishable without depending on whoever typed them remembering the `-Latn` subtag. Region is the language's job, not the kind's: *aubergine* is a `synonym` with `lang = 'en-GB'`, which is why there is no country foreign key on the row — ADR-0001's `country` is the origin axis, and an English regional spelling is not a claim about where a dish comes from.

`lang` is nullable because a romanisation or a name in circulation across several languages genuinely has none, and a nullable text column with a format check is a better fit than a table: unlike ISO 3166-1, BCP 47 is generative — script, region and variant subtags compose — so a closed reference table would be either wrong or endless.

Case-insensitivity comes from a `lower(value)` expression index rather than a `citext` column. `citext` would need a hand-written `CREATE EXTENSION` migration that drizzle-kit never emits, and `drizzle-seed` refuses `customType` columns outright (both verified — see the Drizzle research doc); an expression index costs nothing and needs neither.

## Scope

**i18n here means recording the world's names, not translating the encyclopedia.** vore-db is an English-language reference that holds an item's Japanese name as a fact about that item. `item.description` and the `category`, `tag` and `tag_group` names stay single English columns with no translation tables and no locale resolution. A translation layer, if it is ever wanted, is additive and disturbs nothing decided here.

## Considered options

**Names as rows all the way down**, with no `name` column and an `is_display` partial unique index picking the canonical one. Uniform, and it lets the canonical name carry a language like any other. Rejected because browse is the primary use: every list, card and category page would join to render a title, and the "exactly one display name" rule needs a trigger to guarantee the lower bound — real cost paid on the hottest read to regularise a column that is never actually ambiguous.

**A `native_name` column alongside `name`**, with the alias table for the rest. Rejected: it privileges a second variant without settling anything, and immediately raises a per-item question about which of the two columns a third name sits beside.

**A required ISO 639-1 code from a closed `language` table**, mirroring ADR-0001's treatment of countries. Rejected because it cannot express `ja-Latn` or separate `en-GB` from `en-US`, so aubergine and eggplant collapse into one language and romanisation has to be inferred from the kind alone. The ADR-0001 pattern works for countries precisely because that list is short and closed; language tags are neither.

**No language on the row at all**, leaving value plus kind. Rejected: "show me this item's Japanese name" is most of what the ticket was asking for, and untagged rows would have to be re-tagged by hand later.

**Name kinds as `tag` rows** instead of an enum, so new kinds need no migration. Rejected because `CONTEXT.md` defines a Tag as a fact about an *Item*; pointing tags at a name row widens the concept, which is exactly the blurring ADR-0003 refused when it kept facets out of the category tree.

**A `scientific` kind** for binomial names — *Solanum melongena* for eggplant. Rejected as not a name of the Item at all but a fact about a species, which belongs with the item attributes still open on map #1 rather than in a table of things people call the food.

**Globally unique names.** Rejected because it is false about the world — a drink and a romanisation both spelled "gin" is an ordinary collision — so ingestion would have to mangle genuine names to satisfy the constraint. Nothing needs names to be unique: `slug` is already the global handle.

**A `searchable` boolean** so obscure or historical names could later be excluded from results. Rejected as premature: whether historical names match is a search-relevance question, and nothing today could set the flag meaningfully.

## Consequences

The canonical name is English by convention, not by data — there is no `lang` on `item.name` to check. That is the price of keeping it a column, and it is only defensible because the scope decision above says the encyclopedia itself is English.

The table is deliberately the right substrate for search — one row per string — so the tsvector or `pg_trgm` index that map #1 defers is a purely additive migration over rows that already exist, with no reshaping. No index, generated column or extension lands now.

Two triggers enforce one rule, because an alias can come to restate its item's name from either side: a new alias, or a rename of the item. Both fire immediately rather than at `COMMIT` — unlike ADR-0002's rule, this one only needs the `item` row, which the foreign key already guarantees exists.

`item_name` needs a surrogate key, since a unique index over an *expression* cannot be a primary key. Its type is not fixed here; it follows whatever map #1's open "Table conventions" decision settles on.

Nothing orders an item's names. Display order — native first, then romanisation, then synonyms — is a read-time `ORDER BY kind`, not a column, and stays that way until someone finds an item whose names need hand-ranking.
