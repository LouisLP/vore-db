---
status: accepted
---

# A Run mints a Slug once, and never merges it

ADR-0006 made a Slug authored rather than derived, so that it survives a rename. ADR-0009
puts the Slug in the Item file, which a Run writes. At thousands of Items the Run has to
propose one, and this settles how it does that, and what happens when the Slug it wants is
already taken (#31).

**A Slug is minted when the Run first writes an Item file, and only then.** It is not part
of `_upstream`, and no later Run reads or rewrites it. This amends ADR-0009, where every
field merges three ways. A merged Slug would move whenever Wikidata's label moved and the
reviewer hadn't touched it, which is the rename ADR-0006 says a Slug must survive.

**The Slug is derived from the Name, whatever the Name's source.** The Run normalises the
Name: NFKD with diacritics stripped (`phở` → `pho`), apostrophes dropped, every other run of
non-alphanumerics turned into `-`, then trimmed. With no usable Name, the Run mints nothing
and leaves `slug` empty. The schema allows that only while `review: pending`, so the human
fills it in before accepting.

**Collisions are checked when the Slug is minted, against every Slug that exists.** That
means the seed, the Run's own Batch, and every other Batch under `catalogue/imports/`. The
rebuild's duplicate-Slug failure (ADR-0009) becomes a backstop. On a collision the Run
appends the primary Country's code (`curry` → `curry-jp`). If that is taken too, or the
Item has no Primary country, it mints nothing. Every collision is listed in the Run
report, because two candidates wanting one Slug are often one Item.

**New Items are minted in QID order**, so the same sources produce the same Slugs. Two new
`ramen` candidates in one Run give `ramen` to the lower QID and `ramen-jp` to the other.

**A minted Slug is not drafted.** It comes from a mechanical rule, not from the drafting
model, and the reviewer sees it in the PR diff anyway.

**A human may rename a Slug at any time, with no redirect.** Nothing is published, and
ADR-0006 already treats a redirect table as a separate decision.

## Considered options

**Merge the Slug like any other field.** Rejected for the reason above: a moved label would
move a URL with nobody noticing.

**Derive the Slug from the Wikidata `en` label directly.** Rejected: the Slug should read
like the Name the reader sees, and where the Name comes from belongs to the drafting design.

**Suffix with the QID (`curry-q123`) or a counter (`curry-2`).** Rejected: a QID suffix is
unreadable in a URL, and a counter depends on the order things were minted in, across
Batches as well as within one.

**Never auto-resolve, and always leave a collision to the human.** Rejected as the default:
the Country suffix is right often enough. It remains the fallback.

## Consequences

The Item file's schema has to allow an empty `slug` on a pending Item, and fail one on an
accepted Item.

A Slug the Run minted badly, `okonomi-yaki` say, stays that way until a human renames it.
A re-run never repairs it.

Reading every Batch before minting makes a Run depend on the whole `catalogue/` directory,
not just its own Import. ADR-0010 already does the same with `taxonomy.yaml`.
