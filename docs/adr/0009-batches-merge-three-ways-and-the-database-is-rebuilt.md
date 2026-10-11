---
status: accepted
---

# Batches merge three ways, and the database is rebuilt from them

ADR-0008 made checked-in files the truth and the database their projection, but left two
things open: how a Batch records that a human set a value, and how the files reach the
database. This settles both, along with the Batch's shape (#21).

```
catalogue/                          repo root, beside LICENSE-DATA (CC0)
  rejections.yaml                   global Rejection list: {scheme, value, reason}
  imports/<import>/
    items/<qid>.yaml                human-editable, one per candidate Item
    _upstream/<qid>.json            machine-owned snapshot, linguist-generated
```

**A human edit is a difference from the upstream snapshot, not a marker.** Every Run
writes two things per Item: `_upstream/<qid>.json`, which holds what the sources and the
drafting model said, and the Item file the human edits in place. On the next Run, each field
is merged three ways (old upstream, new upstream, file), and so is each collection element
(Alias `lower(value)`, Image `commonsPageId` or else `url`, Country `(code, role)`, Tag Slug,
External id `(scheme, value)`). If the file still matches the old upstream, the field takes
the new upstream value. Otherwise the human value stays, and the Run's report lists it. The
reviewer never flips a flag to claim an edit, so no flag can be forgotten.

**One YAML file per Item.** Descriptions are prose, and YAML block scalars and comments suit
hand-editing. JSON has no comments, and a generated TypeScript file cannot be regenerated
once a human has edited it. The files are validated against a zod schema at Run and at
rebuild. Splitting by Item keeps a 500-Item Batch reviewable and makes merge conflicts rare.

**Review state lives in the file.** Each Item carries `review: pending | accepted`, and a
`drafted` list of the fields the drafting model wrote. Accepting is a human edit like any
other, so the merge preserves it. Only accepted Items load. An accepted Item whose Origin is
drafted and uncorroborated by a structured source fails the rebuild.

**The loader rebuilds; it does not upsert.** `db:rebuild` migrates, truncates, runs the seed,
then loads every Batch's accepted Items in one transaction, skipping rejected External ids.
The deferred origin trigger (ADR-0002) checks the result once. Order across Batches is made
irrelevant rather than chosen: the same External id or Slug in two Batches fails the rebuild.

**Rejecting is one line.** Adding `{scheme, value, reason}` to `rejections.yaml` is the whole
act. The loader skips the id at once, and the next Run deletes its Item file. Deleting an
Item file without a rejection entry fails `db:check`, because the next Run would bring it
back. A candidate that vanishes upstream is never deleted automatically. Its snapshot is
marked `gone` and the report flags it for the human.

## Considered options

**An overlay**, where a fully generated candidates file is patched by a human-owned edits
file. Rejected: the loader is simpler, but the reviewer has to express edits as patch
operations (`removeAliases: [...]`) instead of editing the value they are looking at, and
the PR diff shows the patch rather than the content.

**Inline markers per field** (`{ value, by: human }`). Rejected: they double the file's
noise, and an edit made without flipping the marker is silently overwritten on the next
Run. That is the exact failure ADR-0008 exists to prevent.

**One file per Import, or TypeScript like `seed.ts`.** Rejected for the reasons above.

**An upsert loader keyed on External id.** Rejected for now. With no editing path into the
database, an upsert only adds orphan handling and drift. Ids churn on rebuild, which is
harmless because ids never appear in a URL (ADR-0006).

**Merge-as-approval**, where merging the PR accepts the whole Run. Rejected: it can't defer
part of a Run, and a deferred Item left out of the file would be proposed again.

## Consequences

`seed.ts` stays as it is, a fixture of ten stress-test Items, and loads first. It is not a
Batch.

The rebuild is destructive. A long-lived production database, if one is ever wanted, needs
an upsert loader and reopens this decision.

Run output is deterministic: keys are ordered, Items are keyed by their first QID, and the
same sources produce the same bytes. That keeps a re-run's diff down to what actually
changed.

The drafting model never re-drafts a field that already has a value, so drafts are stable
across Runs and a re-run doesn't churn prose under review.
