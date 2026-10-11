---
status: accepted
---

# A Run detects duplicates, and a human merges them

ADR-0008 lets an Item carry many External ids so that two Wikidata items vore-db treats as
one can be merged. Jiaozi (Q640769) and Japanese gyoza (Q107014807) are one case, and the
two matcha items are another. It left open how a Run notices a duplicate and how the
reviewer resolves one. The Japan pilot will meet all three shapes: a regional variant
beside the general dish, a candidate that is already a seed Item (sushi), and, once Korea
runs, a QID that two Imports both reach (#32).

```
catalogue/imports/<import>/items/<qid>.yaml
  externalIds:  [{ scheme, value }]     the filename QID first, then any merged in
  distinctFrom: [Q…]                    human-only: pairs not to flag again

seed.ts Items
  externalIds:  [{ scheme, value }]     added by hand, recognition only
```

**An External id is claimed once any Item carries it.** The claimed set is every id in the
seed and in every Item file under `catalogue/imports/`, whether it is a file's own QID or an
entry in its `externalIds`. A Run proposes no file for a claimed id. This is the only
mechanical step a Run takes about duplicates. Everything else is detected and reported, and
a human decides.

**A merge is a human edit.** The surviving file keeps its filename, which is never renamed.
The merged-away QID goes into the survivor's `externalIds`, its Name usually becomes a
Synonym Alias, and its file and snapshot are deleted. The merged-away QID does not go on the
Rejection list, because that list says "not an Item", and this is an Item. Being claimed
already stops it being proposed. This amends ADR-0009: deleting an Item file is allowed when
its QID is claimed by another Item.

**A merged-in id is recognition only.** The survivor's `_upstream` is drawn from its
filename QID alone. The Run doesn't union facts from the other ids, because two sources for
one field would conflict, and drafted versus sourced would stop meaning one thing. Whatever
is worth keeping from the merged-away item, a Native Alias or an Image say, the human copies
over as an edit. The Run does check every claimed id. If one has gone, it is reported.

**Seed Items carry External ids too, by hand.** When the first Japan Run reaches Q46383, the
report flags it against the seed's `sushi` (Slug collision and Name match), and the reviewer
adds the QID to the seed Item. From then on it is claimed like any other. The seed stays a
fixture, with no `_upstream` and no facts flowing in.

**The Batch that holds the file owns the Item.** A Korea Run that reaches a dish Japan has
already claimed writes nothing for it. The report lists it under "Claimed elsewhere", with
what the Run would have added, such as a `KR` row with role `popular-in`. The reviewer adds
that to the owner's file. Moving an Item to another Import means moving its file and
snapshot together. The rebuild's cross-Batch duplicate check (ADR-0009) stays as a
backstop.

**Detection is report-only, in two strengths.**

- *Likely duplicate*: a Slug collision (ADR-0011), a match of normalised Name or Alias
  (NFKD, lowercased) against any existing Item or candidate, or a Wikidata P460 "said to be
  the same as" between two in-scope QIDs.
- *Possible variant*: a direct P279 or P361 edge between two candidates in the same Run.
  This is listed apart because it is noisy. Nigiri is P279 sushi and is an Item in its own
  right.

A pair is never flagged when either side lists the other in `distinctFrom`, or when
Wikidata states P1889 "different from" between them. `distinctFrom` is human-only. It is
never in `_upstream`, so the three-way merge keeps it.

**A regional variant merges by default.** Hiroshima-style okonomiyaki goes into
okonomiyaki: its QID into `externalIds`, its name as a Synonym. It stays separate only when
it is widely known under its own name as a distinct thing. A variant is never rejected.

**Wikidata's own merges are followed.** When a claimed QID has become a redirect, the Run
fetches the snapshot from the target, and the target arrives as a Run-added `externalIds`
element. The filename stays. If the target is already claimed by another Item, the pair is
a likely duplicate, and `db:check` fails until a human merges them.

**The report goes to stdout as Markdown**, in sections: Claimed elsewhere, Likely
duplicates, Possible variants, Slug collisions. Each pair shows QIDs, Names and file paths.
It is pasted into the Run's PR body, not checked in, so it adds no churning file to every
diff.

**`db:check` enforces three invariants.**

1. No id is claimed twice, across the seed and every file, filenames and `externalIds`
   alike. A half-done merge, with the survivor listing gyoza while gyoza's file still
   exists, fails here.
2. No id is both claimed and on `rejections.yaml`.
3. No Item file is deleted unless its QID is claimed elsewhere or rejected (narrowing
   ADR-0009's rule).

## Considered options

**Auto-merge on strong signals**, such as a shared Name or P460. Rejected: every signal
has false positives (nigiri and sushi, two different curries), and an automatic merge
deletes a file the reviewer may have edited. A report is cheap to read in the PR.

**A Rejection-list entry for every merged-away QID.** Rejected: it would conflate "not an
Item" with "the same Item", and claiming already stops the QID being proposed. A later
un-merge would also have to remember to delete the rejection.

**Union the facts of every claimed id into the survivor's upstream.** Rejected for the
conflict and drafted-versus-sourced reasons above. It would also let an Item's content
depend on which ids happen to be merged in.

**Skip candidates that match the seed, or rely on the rebuild's duplicate-Slug check.**
Rejected: a skip by Name is a guess, and the Slug check only fires when the Slugs happen to
match. A claimed id on the seed is exact and lasts.

**A shared Import for dishes that two Countries both reach.** Rejected: ownership by file
is already unambiguous, and a shared Import would need its own scope rule.

**Check the report in**, or remember not-duplicates in a global file. Rejected: a checked-in
report churns on every Run, and a global pair list drifts away from the Items it names.
`distinctFrom` lives on the Item and moves with it.

## Consequences

The Item file's zod schema gains `externalIds` and `distinctFrom`, and `seed.ts` Items gain
`externalIds`.

A Run reads every Item file and the seed before proposing anything, to build the claimed
set. ADR-0011's Slug check already makes it read the whole of `catalogue/`.

A merge takes one PR and three edits: append to `externalIds`, add the Alias, delete the
file and snapshot. `db:check` catches a merge left half done.

Un-merging means removing the id from `externalIds`. The next Run then proposes it again as
a new candidate.
