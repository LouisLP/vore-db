---
status: accepted
---

# External ids live in their own table, and checked-in files are the truth

ADR-0006 declined to guess the shape of provenance until a real source existed. Wikidata is
now that source (research in #17), and Commons supplies the Images (#18). This settles what
an External id looks like, what carries one, and how a re-run Import knows a human has
edited something so that the edit wins.

```
item_external_id                       item_image (added column)
  item_id -> item.id  NOT NULL           commons_page_id  integer NULL
          ON DELETE CASCADE
  scheme  text NOT NULL                  UNIQUE (item_id, commons_page_id)
          CHECK (scheme IN ('wikidata'))
  value   text NOT NULL

  PRIMARY KEY (scheme, value)
```

**An Item's External ids are rows in `item_external_id`, not columns on `item`.** An Item may
carry several. `(scheme, value)` is globally unique, so one QID points at most one Item.
`scheme` is a `CHECK`ed text rather than a reference table. Adding a source means widening
the `CHECK` in a migration, which is the point at which a new source should be thought about
anyway.

**Images carry the Commons page id; nothing else carries an External id.** A Commons file
URL 404s after a rename, but the page id survives it, so a re-run refreshes `url` keyed on
`commons_page_id`. Aliases are matched within their Item on `lower(value)`, the way the
existing unique index already treats them. Countries are keyed by ISO code, and the Import
maps Wikidata's country QIDs to codes in code. Categories and Tags are mapped from Wikidata
classes to Slugs on the taxonomy's own nodes (amended by ADR-0010; first placed in the
Import's configuration).

**Checked-in files are the source of truth, and the database is their projection.** There
is no editing UI. A human edits the catalogue by changing `seed.ts` or an Import's batch
file in a PR, so "a human edited this" is a fact the batch file can record, and no database
column has to. A re-run diffs its fresh candidates against the checked-in batch file and
keeps every field a human has changed. The database can be rebuilt from seed plus batch
files at any time. An edit made directly in the database is unsupported and is lost on the
next load.

**Human edits win per field, and per element in collections.** Changing an Item's
description does not freeze its Image URL. A human-added Alias, Image, Country role or Tag
stays. So does a human removal. New elements from the source still arrive.

**A rejected or deleted candidate goes on the Rejection list.** It is a checked-in list of
External ids, each with a one-line reason, and no Import proposes an id on it. Deleting an
Item cascades its `item_external_id` rows away. Without the list, the next run would
propose the same QID again, and it would come back.

## Considered options

**One nullable column per source**, such as `item.wikidata_qid text unique`. Rejected
because of dedup: Wikidata splits things vore-db treats as one Item. Jiaozi (Q640769) and
Japanese gyoza (Q107014807) are one example. Merging them should keep both QIDs, so a re-run
recognises either one. A single column can hold only one, and the other would be proposed
again as a new candidate.

**A generic external id on every table**, including Aliases, Countries, Categories and
Tags. Rejected: each of these already has a natural key, or is matched within its Item.
Ids nobody looks things up by are columns everybody has to fill.

**Per-field locks in the database**, such as a `locked_fields text[]` on each editorial
table or a per-field origin marker. Rejected: they are only needed if the database can be
edited by something other than the files, and nothing can be. They would add a column to
every table, and a lock the loader forgets to check is a silent overwrite.

**Per-row locks**, where any human touch freezes the whole Item. Rejected: an Image's `url`
has to keep refreshing after the reviewer has rewritten the description.

**A tombstone table in the database** instead of a checked-in Rejection list. Rejected for
the same reason as the database locks. It would also outlive a rebuild only if the rebuild
knew to keep it.

## Consequences

The database is disposable. Rebuilding it means running seed plus every batch file, in
order. The order matters, and #21 has to settle it.

A batch file carries more than candidate values. Per field, it has to record whether a
human set the value. #21 decides how.

Seeded Items have no External ids. Matching them to candidates is the "Dedup and merge" fog
on the map, and when it is resolved, those QIDs are added by a human edit like any other.

Any future editing UI reopens this decision, because it would make the database a second
place where edits happen.
