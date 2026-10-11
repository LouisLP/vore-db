---
status: accepted
---

# Catalogue content is CC0; only CC0 sources may be imported

vore-db publishes its own catalogue content under **CC0 1.0** (`LICENSE-DATA`) and its code under **MIT** (`LICENSE`). The terms apply now, before the first Import lands, so the pilot's Items are never in a repo without them.

The licence covers everything vore-db authors, wherever it appears — seed files, Import batch files, database exports, the API: Items, Names, Aliases, descriptions, Slugs, Origins, Categories, Tags and Tag groups, and the alt text and captions vore-db writes for Images. It does not cover the Images themselves. An Image is a reference to a file hosted elsewhere (ADR-0005) and carries its own Licence; an Attribution string is a reproduced fact about that file, not vore-db's work.

Choosing CC0 fixes what an Import may draw on:

- **Bulk sources must be CC0 or public domain.** Wikidata qualifies. ODbL data (the Open Food Facts database, OpenStreetMap), CC BY-SA text (Wikipedia, and its infoboxes via DBpedia) and CC BY datasets do not, however convenient. A human checking a single fact against any source is fine — facts are not copyrightable — but systematic extraction from a non-CC0 source is not.
- **Drafting prompts contain only CC0 facts and vore-db's own content.** Model output is ours to release, but a description drafted from Wikipedia prose in the prompt could be a derivative of it. Keeping the inputs clean keeps the output releasable.
- **Images may carry any Licence on the `media_licence` list, share-alike included.** vore-db stores a URL and an Attribution and never redistributes the file, so a CC BY-SA photograph does not pull share-alike onto the data around it. Which codes are on that list is a separate question.

## Considered options

**CC BY 4.0.** Rejected: it buys vore-db a credit line at the cost of stacking an attribution duty on a dataset whose spine owes none, and Wikidata accepts only CC0, so nothing could ever flow back upstream. It would also make the copyright status of model-drafted descriptions a live question; under CC0 it doesn't matter.

**ODbL.** Rejected: it would admit Open Food Facts and OpenStreetMap as sources, but share-alike is inherited by every reuser, which is the opposite of the permissive stance the population effort set out with.

**Not yet published** — all rights reserved, decide later. Rejected: content would accumulate under no stated terms, and relicensing later is harder than declaring now. Nothing has been published yet, so this is the cheapest moment to fix it.

## Consequences

Some sources that would make population faster are closed. If the Open Food Facts taxonomies are not CC0-compatible, they can inform the shape of vore-db's taxonomy but not be imported into it.

Anyone may take the catalogue without credit, including commercially. That is the point, not a side effect.

Changing course later is one-way: content already released under CC0 stays CC0 for whoever took it. A move to a stricter licence would bind only what is written afterwards.
