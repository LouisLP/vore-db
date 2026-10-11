---
status: accepted
---

# The taxonomy is hand-owned, and carries its own class map

ADR-0003 fixed the taxonomy's shape, and `seed.ts` has held its rows ever since. Batches are
now truth too (ADR-0009). A Japan Run will want Categories that don't exist yet, such as a
pancake, a noodle soup or a confection. This settles where the taxonomy lives, who grows it,
and how a Run assigns a Category and Tags (#29).

```
catalogue/
  taxonomy.yaml                     hand-owned: no _upstream, no three-way merge
    categories:  { slug, name, parent, wikidata?: [Q…] }
    tagGroups:   { slug, name, tags: [{ slug, name, wikidata?: [Q…] }] }
```

**The taxonomy lives in one global `catalogue/taxonomy.yaml`, and only a human edits it.**
`db:rebuild` loads it before the seed. `seed.ts` keeps its ten fixture Items and refers to
the taxonomy by Slug only. The file has no upstream snapshot, because nothing upstream
writes it.

**A Run never proposes a Category or Tag.** It only emits Slugs that already exist. Gaps
surface in the Run report instead, as unmapped classes with candidate counts. The human
adds the nodes they justify and re-runs. The pilot starts with the existing taxonomy and
grows it only through this loop.

**The Wikidata-class map sits on the node it targets.** A node's `wikidata` list names the
classes that mean it. Classes mean the same thing in every Import, so Korea reuses what
Japan mapped. An Import's own configuration keeps only its scope: Country, root classes and
blocklist. This amends ADR-0008, which put the map in each Import's configuration.

**A mapped class is sourced, and the drafting model fills only the gap.** A Run walks a
candidate's P31/P279 chain to the mapped classes it reaches. The nearest by hops wins. A tie
goes to the deeper vore-db node, and anything still tied goes to the drafting model, which
may choose only among the tied Slugs. With no mapped class at all, the model picks from the
whole closed list. Either way, `category` is marked `drafted`. If nothing fits better than
the Root the spine already guarantees, the Item gets that Root, still `drafted`, and the
report lists it as a taxonomy gap. A candidate is never held back for want of a Category.
Tags work the same way, but most will be drafted, because Wikidata rarely states "vegan" or
"street food".

**Growing the taxonomy re-categorises through the normal merge.** When a newly added node
maps a candidate's class, the next Run's upstream holds the sourced Category, and `category`
leaves `drafted`. ADR-0009's three-way merge decides the rest. A file that still equals the
old upstream moves, and the move shows in the PR diff. A Category a human changed stays.
ADR-0009's rule against re-drafting covers the model's output, not a newly sourced fact.

**An unknown Slug fails.** The zod schema and `db:check` reject any Item file, or the seed,
that names a Category or Tag Slug missing from `taxonomy.yaml`. Renaming or removing a node
means editing every file that references it, in the same PR. There are no redirects.

## Considered options

**Leave the taxonomy in `seed.ts`.** Rejected: every new node would be a TypeScript edit,
and every Batch would depend on a test fixture that ADR-0009 says is not a Batch.

**Taxonomy fragments per Import.** Rejected: two Imports would each define `pancake`, and
the rebuild would have to merge or reject them, which is the cross-Batch collision ADR-0009
already fails on.

**Let a Run propose a node, drafted and pending review.** Rejected: model-invented nodes
breed near-duplicates (`pancake`, `savoury-pancake`, `griddle-cake`), and ADR-0003 holds the
line between Category and Tag by review. A few hundred near-static nodes are cheap for a
human to add on the evidence of a report.

**Class mapping only, or the model only.** Rejected: mapping alone leaves most candidates
uncategorised, and the model alone makes every Category something the reviewer has to
scrutinise. Mapping first means only the remainder is drafted.

**Map classes in each Import's configuration**, as ADR-0008 first said. Rejected: the same
class would be re-mapped per Import and could drift apart.

**Redirects for renamed Slugs.** Rejected: at this scale a rename is a one-PR edit, and a
redirect table is a second identity for a node that has one.

## Consequences

`seed.ts` loses `CATEGORIES` and `TAG_GROUPS`. Its Items still name Slugs, which are now
validated against `taxonomy.yaml`.

The taxonomy's names, and its class lists, are vore-db's own content and can go into a
drafting prompt under ADR-0007.

A Run's output depends on `taxonomy.yaml` as well as on its sources. Adding a node can change
a Run's bytes, and that is intended.

Mapping a class to the wrong node moves every Item under it at the next Run. The PR diff is
where that gets caught.
