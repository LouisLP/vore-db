---
status: accepted
---

# Item shape and taxonomy

One `item` table holds every food and drink. A single adjacency-list `category` tree says what each item *is*; a separate, grouped `tag` table carries everything an item is merely *also true of*. There is no food/drink discriminator column — `drink` is a category root, so drink-ness is a fact about an item's place in the taxonomy rather than a column that can drift out of agreement with it.

```
category                       tag_group
  id, slug UNIQUE, name          id, slug UNIQUE, name
  parent_id -> category.id
    NULL for roots             tag
                                 id, slug UNIQUE, name
item                             group_id -> tag_group.id  NOT NULL
  id, slug UNIQUE, name
  description                  item_tag
  category_id -> category.id     item_id -> item.id
    NOT NULL                     tag_id  -> tag.id
                                 PRIMARY KEY (item_id, tag_id)
```

The roots are `dish`, `ingredient` and `drink`. Depth below them is ragged, and an item may attach to any node rather than only a leaf.

## Considered options

**Separate `food` and `drink` tables.** Rejected: nothing structural differs between a negroni and a pad thai — both carry a name, a description, origins, aliases, an image — so every cross-cutting concern would double or need a supertype table, in a schema whose primary use is browsing everything at once.

**A `kind` enum on `item`.** Rejected for the same reason ADR-0002 rejected a `primary_country_code` column: it denormalises a fact that already lives elsewhere and can therefore disagree with it. The food/drink line is also genuinely blurry — soup, smoothie, drinking yoghurt — so the column would need a ruling per awkward item. The cost is that "all drinks" is a recursive CTE over the `drink` subtree rather than a column predicate, which is nothing at encyclopedia scale.

**`ltree`, or a closure table, instead of an adjacency list.** Rejected: `parent_id` as a plain self-FK needs no Postgres extension, no Drizzle custom type, and nothing kept in sync. The tree is a few hundred near-static nodes, so recursive CTEs are effectively free and never justify `ltree`'s extension plus descendant-path rewriting, or a closure table's maintenance triggers.

**Many-to-many `item_category` with an `is_primary` flag.** Considered seriously and rejected once tags became a separate mechanism: the second edge existed to carry facets, and `tag` does that better. A single required FK guarantees every item is classified, makes the subtree walk unambiguous, and removes a standing per-item judgement about whether a concept is a secondary category or a tag. Note this points the opposite way from ADR-0002's decision to keep countries in a join table, and for a consistent reason: an item genuinely has several countries, but only ever one answer to "what is it".

**Facet roots inside the category tree** — `diet`, `preparation`, `texture` as siblings of `dish` — with the primary edge pointing into a taxonomic root. Rejected: it reuses one mechanism but blurs the two concepts, so "is this a category or a facet" becomes a live question forever. Separate tables draw the line structurally instead.

**Flat tags, with no `tag_group`.** Rejected because browse and filter are the stated primary use: a filter panel per family reads far better than one flat wall of chips, and a group is a seed row rather than a migration.

**Leaf-only attachment**, so every item sits at maximum specificity. Rejected: a node is a leaf only until it is subdivided, so the rule would turn every deepening of a branch into a data migration — and Postgres cannot express it declaratively, so it would need a trigger too.

**Uniform tree depth**, pinned by a check constraint. Rejected because real food taxonomies are ragged — spirits justify four levels, vegetables do not — and uniformity manufactures filler nodes (`vegetable > other > eggplant`) that mean nothing and then have to be hidden in the UI.

## Consequences

Numeric attributes cannot be tags. ABV, serving temperature and similar still need real columns and remain unspecified — see map #1, "Further item attributes".

The three roots are not perfectly parallel: a negroni is arguably a dish as much as a drink. Because the category FK admits one answer, dual-nature items are categorised where a reader would look for them and tagged for the other reading — gin is a `drink`, tagged `ingredient`. That convention is the price of a single enforced placement, and it is written down in `CONTEXT.md` rather than enforced by the schema.

Nothing in the database stops a tag from being secretly taxonomic, or a category from being secretly a facet. The line is held by review against the glossary.

A category page must show its own items and its descendants' — one recursive CTE, not two queries.

The `item` columns above are only the ones this decision fixes. Id type, audit columns and slug conventions (map #1, "Table conventions" and "Stable identity"), origin (ADR-0001, ADR-0002), names and aliases (#4) and media (#5) all add to this table.
