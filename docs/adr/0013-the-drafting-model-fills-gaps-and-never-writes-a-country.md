---
status: accepted
---

# The drafting model fills gaps, and never writes a Country

ADR-0009 gave the drafting model a place in the Batch: `_upstream` holds what it said, and
`drafted` lists what it wrote. ADR-0010 let it break Category ties from a closed list.
ADR-0007 limited its prompts to CC0 facts and vore-db's own content. That leaves what it
drafts, from what input, and how a drafted Origin is corroborated (#33).

**The model writes only what no structured source supplies.**

| Field | Who writes it |
| --- | --- |
| Name | The Wikidata `en` label. The model drafts one only when there is no `en` label. |
| Native and Synonym Aliases | Wikidata `ja` and `en` labels and aliases. Never the model. |
| Romanisation Aliases | The model drafts one per Native Alias: modified Hepburn with macrons (`shōchū`), `lang: ja-Latn`. It is dropped if it would equal the Name or another Alias by `lower(value)`. |
| Description | Always the model. |
| Category | The class map first, and the model only for ties or gaps (ADR-0010). |
| Tags | The class map first, then the model from the closed list. It adds at most five, and zero is a valid answer. It never drafts a Tag from the diet group. |
| Image alt text | A template: the Item's Name. Mechanical, so not drafted. |
| Countries, all roles | Structured sources and the human. Never the model. |
| Slug | Minted from the Name (ADR-0011). Not drafted. |

A wrong `vegan` is a false claim a reader acts on, and a missing one is only incomplete, so
diet Tags come from mapped classes or the human. Alt text would need the image in the
prompt, and a CC BY-SA photograph is not a CC0 input. A Name-based alt text is a fair
default, and the human improves the ones that matter.

**A description is one or two sentences, and at most about 280 characters.** It is neutral,
in the present tense, and says what the Item is, what it is made from or what form it takes,
and how it is eaten or drunk. It makes no claims of history, etymology, popularity or
superlatives. Those are the facts a model is most likely to invent, and the ones most likely
to echo a Wikipedia lede. The guard is the input: the prompt holds no Wikipedia text and
tells the model to write fresh prose rather than expand the Wikidata gloss. There is no
similarity check against Wikipedia. One reviewer reads every description anyway. An accepted
Batch Item must have a description. `item.description` stays nullable for the seed.

**The model writes no Country, so a Run never produces a drafted Origin.** Candidates are
drawn by `P495 ∪ P2012→P17` (#17), so every candidate already arrives with a structured
Country. Each source corroborates the Country it names, so P495 alone or `P2012→P17` alone
is enough, and every corroborated Country goes in with the `origin` role. When the two
sources name different Countries (ramen has P495 China and Japanese cuisine), both go in and
the Run report flags the Item, and the human drops the one that is wrong. `national dish` and
`popular in` are the human's to add. ADR-0009's rule that a drafted, uncorroborated Origin
fails the rebuild stays as a backstop. If one ever appears, the human signs it off by
removing its `drafted` entry.

**`drafted` is element-level, and acceptance covers it.** An entry names a field
(`description`, `category`, `name`) or one element of a collection (`alias:shōchū`,
`tag:street-food`), because Aliases and Tags mix sourced and drafted values. Setting
`review: accepted` accepts every drafted value in the file. The `drafted` list stays as a
record of what the model wrote and is not a to-do list. That amends ADR-0009, which spoke of
a list of fields.

**One request per Item per Run, covering only that Item's empty fields.** Drafting the gaps
together keeps the description, Category and Tags consistent with one another. The fields
already filled are passed in as context. The facts in the prompt are all CC0 Wikidata or
vore-db's own: `en` and `ja` labels and aliases, the `en` description, the labels along the
P31/P279 chain, P186 *made from material*, the corroborated Countries, and the allowed
Category and Tag Slugs with their names. The response is structured output whose Slug fields
are enums of the allowed values. Requests go through the Message Batches API, and the
taxonomy sits in a cached prefix.

**The model is Claude Opus 5.5 at low to medium effort.** Batched, that is under a dollar for
the pilot's ~50 Items and about $80 for 5,000. The reviewer's time costs more than either,
so draft quality comes first. A Run estimates its tokens before submitting and aborts above
a configured cap, $10 by default.

**`_upstream` is the cache.** A drafted value already in the old upstream carries forward
unchanged. The model is asked only for fields that are empty in both the old upstream and
the Item file. A field the human blanked differs from upstream, so it stays blank and is not
re-drafted. Each Item's upstream records `{ model, promptVersion }`. Changing either does not
re-draft anything. Re-drafting takes `--redraft <field>` on a Run, which ignores the old
upstream value for that field.

**A failed draft leaves its fields empty.** That covers an errored or expired batch result,
a refusal, an invalid response and a Slug outside the allowed list. The Run still writes the
sourced fields, lists the Item in its report, and retries on the next Run because the fields
are still empty. A missing description keeps the Item from being accepted, so a failure
cannot slip through review.

## Considered options

**Let the model propose Origins or other Country roles.** Rejected: every candidate already
has a structured Country, and "popular in" is the claim a model is least able to check.
Corroboration would become a review burden on every Item instead of a rare backstop.

**Require P495 and `P2012→P17` to agree.** Rejected: it would drop tempura and nori, which
only one source places in Japan.

**Romanise with a deterministic transliterator.** Rejected: kanji readings depend on the
word, and a dictionary tokenizer misreads food names often enough to need review anyway.
It would be determinism without accuracy.

**Send the Image to the model for alt text.** Rejected under ADR-0007. Commons structured
data ("depicts") is CC0 and could come later.

**A field-level `drafted` list, or per-value sign-off.** Rejected: field-level can't tell a
sourced Native from a drafted Romanisation, and per-value sign-off makes accepting an Item a
chore of clearing flags, the failure ADR-0009 avoided for human edits.

**A cache directory keyed by prompt hash.** Rejected: `_upstream` already holds every draft
and is checked in, so a second store would only drift from it.

**Sonnet 5.5 or Haiku 5.5.** Not rejected, only deferred. If the pilot's drafts look easy,
bulk Imports can move down a tier by changing `model`, and nothing already drafted changes.

## Consequences

The Item file's schema accepts element keys in `drafted` and requires a description once
`review: accepted`.

The Run report gains sections for Countries the two sources disagree on, failed drafts, and
drafting cost.

A description drafted under an old prompt stays until someone asks for `--redraft
description`. Prompt improvements reach existing Items only on request.

Imports beyond Japan need a romanisation rule per script. Hepburn is Japan's. Korean,
Chinese, Thai and the rest each need a convention chosen when their Import is set up.
