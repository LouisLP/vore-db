---
status: accepted
---

# Images are external references, ordered, and optional

An item may carry any number of images, or none. Each is a row in `item_image` holding a URL to a file hosted somewhere else — this project never stores bytes. The rows are ordered by an integer `position`, and the primary image is simply the one with the lowest position rather than a separate flag that could disagree with the ordering.

```
media_licence                      item_image
  code UNIQUE, name                  id
  url                                item_id -> item.id  NOT NULL  ON DELETE CASCADE
  requires_attribution               url             NOT NULL
                                     alt_text        NOT NULL
                                     position        NOT NULL  CHECK (position >= 0)
                                     caption         NULL
                                     licence_code -> media_licence.code  NULL
                                     attribution     NULL
                                     source_page_url NULL

                                     UNIQUE (item_id, position)
                                     UNIQUE (item_id, url)
```

`url` is where the bytes are; `source_page_url` is the page those bytes came from — a Wikimedia Commons file page carries the licence and the author, and is what an attribution line must link to. They are separate columns because they answer different questions and only one of them is safe to hotlink from a caption.

`alt_text` is the only editorial field the database requires. Licence, attribution and source page exist as nullable columns: the shape is fixed now, but a nullable column can be tightened to `NOT NULL` in one line once real data exists, whereas a column that was never added has to be backfilled.

## Considered options

**Self-hosting the files**, on disk or in an object store. Rejected for v1: it drags in a storage key, MIME type, byte size, dimensions and a checksum for deduplication, plus an upload path that no part of this project has. The likely population sources serve stable URLs with licences already attached. The column is named `url` rather than anything source-specific so that self-hosting later adds a column instead of restructuring the table.

**A single image as columns on `item`** — `image_url`, `image_attribution` and so on. Rejected because a second image is then a table migration plus a backfill, and an encyclopedia entry with one photo is a floor rather than a ceiling.

**A JSONB `images` array on `item`.** Rejected on the same grounds as ADR-0001 and ADR-0002 preferred real tables: JSONB buys no foreign key, no per-image uniqueness, no `CHECK`, and no index worth having for "every image missing attribution" — which is exactly the audit that matters when population is bulk and deferred.

**A separate `is_primary` flag**, mirroring `item_country`. Rejected because ordering and primacy would then be two facts that can contradict each other, needing a partial unique index to enforce at-most-one and still permitting a "primary" image sitting third. This points the opposite way from ADR-0002's flag for a consistent reason: countries have no natural order, so primacy there has to be stated; images do have one, so it can be read off.

**A `pgEnum` of licence codes.** Rejected on the research in #6: removing or renaming an enum value emits SQL that fails on live data, Postgres has no `DROP VALUE` at all, and an enum label cannot carry attributes. The `media_licence` lookup table follows ADR-0001's country mould — a closed set keyed by its own natural code, seeded from a reference list — and its `requires_attribution` column turns a missing credit into a query (`requires_attribution AND attribution IS NULL`) rather than a per-licence judgement in application code.

**Free text for the licence.** Rejected: nothing would stop `CC BY 4.0` and `CC-BY-4.0` both existing, and the field is unvalidated precisely where a licence breach is the failure mode.

**A general `item_media` table with a `media_type` discriminator.** Rejected: the column would have exactly one value for the foreseeable future, and ADR-0003 already rejected that pattern on `item`. A narrow name that is true beats a general one that is aspirational.

**Requiring at least one image per item**, enforced the way ADR-0002 enforces origin. Rejected as a deliberate asymmetry: an origin is definitional — an item with no country is out of scope entirely — whereas a missing image is a gap in presentation, not a claim that the row is invalid. Requiring one would also block seeding until ten licensed photographs had been sourced by hand.

## Consequences

Image coverage is a reporting concern, not an invariant. "Items with no image" is a `LEFT JOIN … WHERE`, and the UI must render an item card with no picture.

Every display path has to handle an unknown licence, because `licence_code` is nullable. The convention — not enforced — is that a row without a licence is not publishable; if that hardens into a rule it becomes a `NOT NULL` migration.

`UNIQUE (item_id, position)` makes the primary image unambiguous, at the cost that reordering an item's images cannot be done as a naive sequence of `UPDATE`s. Either shift through a temporary offset or make the constraint deferrable.

The same photograph illustrating two items is two rows. Uniqueness on `url` is scoped per item deliberately: there is no shared asset entity, so cross-item deduplication is not a thing this schema can express, and duplicated attribution text is the price.

Video and audio are deliberately absent. Nothing in the model anticipates them, and when they arrive the question of whether they even hang off `item` should be asked with real requirements rather than pre-answered by a column.

The `item_image` id type and audit columns are not fixed here — they follow whatever map #1's "Table conventions" settles, as for every other table.
