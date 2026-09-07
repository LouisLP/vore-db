---
status: accepted
---

# Table conventions, stable identity, and how the schema is seeded

The four things map #1 left open under "Table conventions", "Stable identity", "Seeding
mechanism" and "Hooks for future bulk population", settled together because they are one
question wearing four hats: what a row is called, what a row carries besides its content,
and who writes it.

**Surrogate keys are `integer generated always as identity`.** The exceptions are `country`
and `media_licence`, which are keyed by their own natural code because they are closed
reference lists (ADR-0001, ADR-0005).

**`slug` is the stable public handle**, on `item`, `category`, `tag` and `tag_group`. It is
lowercase, unique, matches `^[a-z0-9]+(-[a-z0-9]+)*$` under a `CHECK`, and is authored
rather than derived. Ids never appear in a URL: `/item/pad-thai`, not `/item/1`.

**`created_at` and `updated_at` are `timestamptz not null default now()`** on the tables
holding editorial content — `category`, `tag_group`, `tag`, `item`, `item_name`,
`item_image`. `updated_at` is maintained by a `set_updated_at` trigger, not by the writer.
Reference tables and pure join tables (`item_tag`, `item_country`) carry neither.

**No soft delete.** Deleting an item deletes its names, images and edges by cascade;
deleting a category or a tag that is still referenced is refused by `ON DELETE RESTRICT`.

**No provenance columns in v1** — no Wikidata QID, no Open Food Facts id.

**Seeding is a plain `db.insert()` script**, `backend/src/db/seed.ts`, run with
`pnpm db:seed`. `backend/src/db/verify.ts` (`pnpm db:verify`) asserts the model against it.

## Considered options

**UUIDv7 primary keys**, which Postgres 18 generates natively and which the research in #6
verified works through Drizzle. Rejected: the encyclopedia is authored in one place, so
there is no distributed-authoring or offline-id-generation case to buy, and identity
columns keep every foreign key four bytes and every psql session readable. If bulk
ingestion later wants to mint ids outside the database, that is an argument to revisit —
but it is an argument that does not exist yet.

**`bigint` identity.** Rejected as a number that is wrong by six orders of magnitude: an
encyclopedia of the world's foods is tens of thousands of rows. `integer` runs out at two
billion, and widening a key later is a migration rather than a redesign.

**Slugs derived from the name at write time**, by a trigger or a generated column.
Rejected on the grounds that make a slug worth having at all: it must survive a rename.
"Eggplant" becoming "Aubergine" must not break `/item/eggplant`, and a derived slug breaks
exactly then. Deriving it is a convenience for the *author* of a new row, which is a seed
script's job, not the schema's.

**External ids as the identity** — Wikidata QID as the primary key or the URL handle.
Rejected: it makes every row depend on another project's editorial decisions, and items
this encyclopedia wants may have no QID at all.

**A `version` or `revision` column, or history tables.** Rejected as a different project.
Nothing in the destination asks who changed what, and audit columns that nobody reads are
still columns everybody has to think about.

**Soft delete via `deleted_at`.** Rejected: every query then has to remember a predicate,
and forgetting one is a silent bug rather than an error. Retracting an item from a
reference work is rare and deliberate, and a real delete with cascades says what happened.

**Provenance columns now** — `wikidata_qid`, `off_id`, `source_url` on `item` — so a later
ingestion pipeline has somewhere to land. Rejected, but only just: the columns are cheap
and ADR-0005 made the opposite call about images, adding nullable licence columns ahead of
the data. The difference is that an image's licence fields have a known shape and a known
obligation, whereas the shape of ingestion is genuinely unknown — one id or several, one
source or a table of them, whether a QID is a key or an annotation. Guessing produces
columns that are then wrong in a way that has to be migrated, and ADR-0001's argument
applies: this is additive later and disturbs nothing.

**`drizzle-seed`** for the seed data. Rejected on the research in #6: it generates
*plausible* rows, and what this needs is ten *specific* ones. It also refuses `customType`
columns, and `.returning()` on plain inserts is what supplies the identity ids the edges
need. Reach for it if pagination or index-performance work ever wants thousands of rows.

**A SQL fixture file or a checked-in JSON document** instead of a script. Rejected: a
TypeScript script type-checks against the schema, so a renamed column breaks the seed at
`pnpm type-check` rather than at run time, and it exercises the same Drizzle code path an
application would.

## Consequences

Ids are guessable and sequential. Nothing here is secret, and the public handle is the
slug, so this costs nothing — but it does mean an id must never leak into a URL or an API
response as though it were stable across a rebuild. `pnpm db:seed` truncates with
`RESTART IDENTITY`, so ids are stable only for a given seed.

`updated_at` is true but coarse: the trigger fires on any `UPDATE`, including one that
changes nothing. That is the price of it being enforced rather than remembered.

An item that is retracted is gone, with no tombstone. If a URL needs to keep resolving
after a retraction, that is a redirect table, and it is a new decision.

The first bulk-ingestion effort will start with a migration adding provenance columns.
That is deliberate, and it is one `ALTER TABLE` over rows that already exist.
