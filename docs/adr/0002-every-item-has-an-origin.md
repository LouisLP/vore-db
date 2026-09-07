---
status: accepted
---

# Every item has at least one origin, enforced in the database

An item that cannot be tied to a country is not in scope for this encyclopedia — water, salt and plain sugar are ingredients, but they are nobody's. So the model requires every item to carry at least one `item_country` row with `role = 'origin'`, and the database enforces it rather than trusting convention.

Enforcement is a deferred constraint trigger, checked at `COMMIT` rather than per statement. That is what makes inserting an item and its countries in a single transaction possible at all; a plain `CHECK` cannot see another table, and an immediate trigger would reject the item row before its countries exist.

## Considered options

**A `NOT NULL` `item.primary_country_code` column**, which would guarantee the rule declaratively with no trigger. Rejected because countries would then live in two places — the column and the join table — so "all countries of this item" becomes a `UNION` and browse-by-country has to read both. Keeping `item_country` as the single source of truth is worth one hand-written SQL block in the migration.

**Convention only**, documented and honoured by the seed script. Rejected: an orphan item is one bad insert away, and the rule is a scope boundary rather than a nicety.

**An `origin_status` enum** on the item distinguishing "universal" from "unknown". Rejected once universals were ruled out of the database entirely — there is nothing left for the enum to say.

## Consequences

Any role satisfying the rule would have been the weaker reading; it requires an `origin` row specifically. An item carrying only `popular_in` rows — pizza tagged to the United States and nowhere else — fails at commit, which is correct: it still owes its Italy row.

Future bulk ingestion has to resolve an origin before it can land an item. That is intended, but it means an import pipeline cannot stage rows and enrich them afterwards inside the same table.
