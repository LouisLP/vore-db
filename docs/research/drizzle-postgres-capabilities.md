# Drizzle ORM + PostgreSQL: what it can and cannot express cleanly

**Question:** Can Drizzle (TypeScript schema → drizzle-kit migrations → Postgres) express the schema vore-db needs — enums or a category lookup table, a possibly-hierarchical taxonomy, many-to-many links with payload columns, constraints and partial/expression indexes — without hand-edited SQL? And where does it need an escape hatch?

**Date:** 2026-09-07

**Versions these findings describe** (npm `latest` dist-tag, checked 2026-09-07):

| package | version | note |
| --- | --- | --- |
| `drizzle-orm` | **0.45.2** | `latest`. A `1.0.0-rc.5` exists on the `rc` tag; v1 is **not** `latest`. |
| `drizzle-kit` | **0.31.10** | `latest`. `1.0.0-rc.5` on `rc`. |
| `drizzle-seed` | **0.3.1** | `latest`. |
| PostgreSQL (test target) | **18.1** | `postgres:18.1-alpine` |

> **File location note.** The research ran against an empty repo; by the time it landed, `main` had grown a `CONTEXT.md` + `docs/adr/` layout (the domain-docs convention). This is findings, not a decision record, so it sits at `docs/research/<topic>.md` as a sibling of `docs/adr/` rather than becoming an ADR.

> **How claims were verified.** Everything marked "verified" below was reproduced locally against `drizzle-orm@0.45.2` / `drizzle-kit@0.31.10` and a throwaway `postgres:18.1-alpine` container: real `drizzle-kit generate` output, real `psql` execution, real relational queries. Everything else is cited to a primary doc page. Anything I could not confirm from either is marked **unverified**.

---

## ⚠️ Read this first: the docs site is ahead of the shipping package

`https://orm.drizzle.team/docs/*` now documents **Drizzle v1.0** — the page chrome literally shows a `v1.0 98%` progress marker and an "Upgrade to v1" nav section ([Query / RQB docs](https://orm.drizzle.team/docs/rqb), [v0 → v1 changes](https://orm.drizzle.team/docs/v0-v1-changes)). But `npm install drizzle-orm` still gives you **0.45.2**, which is v0.

Concrete divergences that will bite:

| Topic | Docs site (v1) | What `drizzle-orm@0.45.2` actually does (verified) |
| --- | --- | --- |
| Relations | `defineRelations(schema, (r) => …)` | `defineRelations` **does not exist** (`grep` across the installed package: 0 hits). Only `relations(table, ({one, many}) => …)`. |
| Many-to-many | `r.many.x({ from: …through(…), to: …through(…) })` | No `through()`. You traverse the junction table explicitly. |
| Migration folder | `drizzle/<ts>_<name>/{migration.sql,snapshot.json}`, journal removed ([generate docs](https://orm.drizzle.team/docs/drizzle-kit-generate), [v0→v1](https://orm.drizzle.team/docs/v0-v1-changes)) | `drizzle/0000_init.sql` + `drizzle/meta/_journal.json` + `drizzle/meta/0000_snapshot.json` |
| `getTableColumns()` | renamed `getColumns()` in v1 | still `getTableColumns()` |

**So: pin exact versions in `package.json` (`"drizzle-orm": "0.45.2"`, `"drizzle-kit": "0.31.10"`), and when you read the docs site, mentally translate the relations chapter back to the v0 form.** The v0→v1 migration guide ([relations v1→v2](https://orm.drizzle.team/docs/relations-v1-v2)) is the best available "v0 relations" reference, because it prints the old syntax side by side with the new.

---

## Verdict

Actionable answers, no body-reading required.

**Things Drizzle expresses cleanly (verified — generated correct SQL, applied successfully):**

- CHECK constraints, named unique constraints, composite primary keys, multi-column and self-referencing foreign keys, partial indexes (`.where()`), expression indexes (`sql\`lower(...)\``), operator classes (`.op('gist_ltree_ops')`), `USING gist`/`USING btree`. All via the current `(table) => [ … ]` array-returning callback.
- Adjacency-list hierarchy: self-FK with `(): AnyPgColumn =>` annotation, plus `relations()` with `relationName` for `parent`/`children`. Verified both the DDL and a nested `db.query…with: { category: { with: { parent: true } } }` read.
- Many-to-many **with payload columns**, in v0's `relations()`: the payload comes back naturally because you query *through* the junction relation. Verified — `isOrigin` and `note` appear in the result alongside the nested `country`.
- `pgEnum` creation; **adding** an enum value, including positionally (`ADD VALUE 'condiment' BEFORE 'ingredient'`).
- CHECK constraint *changes* are diffed correctly (emits `DROP CONSTRAINT` + `ADD CONSTRAINT`).
- `uuid().defaultRandom()` → `DEFAULT gen_random_uuid()`; `uuid().default(sql\`uuidv7()\`)` → `DEFAULT uuidv7()` (PG 18 native).
- `integer().primaryKey().generatedAlwaysAsIdentity()` → full `GENERATED ALWAYS AS IDENTITY (…)` clause.

**🚩 Things Drizzle CANNOT express cleanly — the taxonomy gate:**

1. **Removing or renaming an enum value emits SQL that fails on live data.** drizzle-kit takes the drop-and-recreate path (`ALTER … TYPE text` → `DROP TYPE` → `CREATE TYPE` → `ALTER … USING …::enum`). If any row still holds the removed/old value, Postgres errors. Verified: `ERROR: invalid input value for enum item_kind: "drink"`. Drizzle's own release notes say so: *"If the deleted enum value was used by a column, this process will result in a database error."* ([drizzle-kit@0.26.0 release notes](https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.26.0)). A rename is **not** detected as a rename — no `ALTER TYPE … RENAME VALUE` is ever emitted; you get the destructive recreate. Every value removal/rename is a hand-edited migration.
2. **`CREATE EXTENSION` is never emitted.** Drizzle docs state it outright for its two supported extensions ([extensions/pg](https://orm.drizzle.team/docs/extensions/pg)); verified for `citext`/`ltree` too — the generated migration references `"citext"` and `"ltree"` types and dies with `ERROR: type "citext" does not exist`. Every project needs a hand-written `0000_extensions.sql`.
3. **`ltree` and `citext` have zero first-party support.** They work via `customType`, but there are no typed operators — every `<@`, `@>`, `~`, `lquery` match is a raw `sql\`\`` fragment with no type safety. And `drizzle-kit pull` cannot round-trip them: it emits `// TODO: failed to parse database type 'ltree'` and `path: unknown("path")`, which **does not compile**.
4. **`drizzle-seed` rejects `customType` columns outright**: `column with type citext is not supported for now.` (verified.)
5. **The programmatic `migrate()` wraps ALL pending migrations in one transaction** (verified in the shipped `drizzle-orm/pg-core/dialect.cjs` source). Combined with Postgres's rule that *"If `ALTER TYPE … ADD VALUE` … is executed inside a transaction block, the new value cannot be used until after the transaction has been committed"* ([PG ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html)), an "add enum value" migration and a later data migration that *uses* it cannot ship in the same `migrate` run. Verified in psql: `ERROR: unsafe use of new value "drink" of enum type item_kind`.
6. **Postgres cannot drop an enum value at all.** The `ALTER TYPE` reference documents only `ADD VALUE` and `RENAME VALUE` for enums; there is no `DROP VALUE` ([PG ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html)). This is a Postgres constraint, not a Drizzle one — no ORM can fix it.
7. **The relational query API has no recursive traversal.** `with: { children: { with: { children: … } } }` only goes as deep as you literally type. Arbitrary-depth subtree queries need a raw recursive CTE via `db.execute(sql\`with recursive …\`)` (verified working).

> **Corroboration.** [ADR-0003](../adr/0003-item-shape-and-taxonomy.md), accepted independently while this research ran, reaches the same two calls on its own reasoning: an adjacency-list `category` tree rather than `ltree`, and a category FK rather than a `kind` enum. Nothing found here argues against it — the gate is clear.

**Bottom line for the taxonomy decision:** a `pgEnum` category is a decision to revisit the first time a category is renamed or retired. Use a **`categories` lookup table with an FK** — it is fully expressible in Drizzle, and renaming a category becomes a one-row `UPDATE` instead of a hand-edited destructive migration.

---

## 1. `pgEnum`: declaration, and what drizzle-kit emits for add / remove / rename

### Declaration

```ts
import { pgEnum, pgTable, text } from 'drizzle-orm/pg-core';

export const itemKind = pgEnum('item_kind', ['dish', 'ingredient', 'drink']);

export const items = pgTable('items', {
  kind: itemKind().notNull(),
});
```

Emitted ([column types docs](https://orm.drizzle.team/docs/column-types/pg), verified):

```sql
CREATE TYPE "public"."item_kind" AS ENUM('dish', 'ingredient', 'drink');
-- …
	"kind" "item_kind" NOT NULL,
```

### Adding a value — clean

Appending `'dessert'` to the end:

```sql
ALTER TYPE "public"."item_kind" ADD VALUE 'dessert';
```

Inserting `'condiment'` between `'dish'` and `'ingredient'`:

```sql
ALTER TYPE "public"."item_kind" ADD VALUE 'condiment' BEFORE 'ingredient';
```

Both verified. This is the "respect the order of values" behaviour added in [drizzle-kit@0.26.0](https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.26.0), and matches Postgres's documented `ADD VALUE [ IF NOT EXISTS ] [ BEFORE | AFTER ]` form ([PG ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html)).

**Transaction caveat.** Postgres: *"If `ALTER TYPE ... ADD VALUE` (the form that adds a new value to an enum type) is executed inside a transaction block, the new value cannot be used until after the transaction has been committed."* Verified against PG 18.1:

```sql
BEGIN;
ALTER TYPE item_kind ADD VALUE 'drink';
INSERT INTO items VALUES (1,'drink');
-- ERROR:  unsafe use of new value "drink" of enum type item_kind
-- HINT:  New enum values must be committed before they can be used.
```

Drizzle's migrator runs every pending migration inside **one** transaction — from the shipped `drizzle-orm/pg-core/dialect.cjs`:

```js
await session.transaction(async (tx) => {
  for await (const migration of migrations) {
    if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) {
      for (const stmt of migration.sql) { await tx.execute(sql.raw(stmt)); }
      // …insert into drizzle.__drizzle_migrations
    }
  }
});
```

So the DDL itself is fine, but you cannot backfill data using the new value in the same `migrate` invocation. Split it across two runs, or use a lookup table.

### Removing a value — **broken on live data**

Schema change `['dish','condiment','ingredient','drink']` → `['dish','ingredient','drink']` produced (verified):

```sql
ALTER TABLE "items" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."item_kind";--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('dish', 'ingredient', 'drink');--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "kind" SET DATA TYPE "public"."item_kind" USING "kind"::"public"."item_kind";
```

That final `USING` cast fails for any surviving row holding the removed label. Drizzle documents this as expected behaviour ([0.26.0 notes](https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.26.0)). **You must hand-edit** an `UPDATE items SET kind = 'dish' WHERE kind = 'condiment';` in before the cast.

If the column has a default, the emitted statement ordering is also suspicious — verified output:

```sql
ALTER TABLE "items" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "kind" SET DEFAULT 'dish'::text;--> statement-breakpoint
DROP TYPE "public"."item_kind";--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('dish', 'ingredient', 'beverage');--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "kind" SET DEFAULT 'dish'::"public"."item_kind";--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "kind" SET DATA TYPE "public"."item_kind" USING "kind"::"public"."item_kind";
```

Note the enum-typed `SET DEFAULT` is emitted **before** the column is converted back to the enum. On PG 18.1 that particular statement happened to succeed (Postgres coerced the literal); the run still died at the `USING` cast. I did **not** find a case where the ordering alone is fatal, so I will not overclaim — but the ordering is the same one reported in [issue #4295](https://github.com/drizzle-team/drizzle-orm/issues/4295), and it is worth reviewing by hand.

### Renaming a value — no rename detection

Postgres supports it: *"RENAME VALUE — This form renames a value of an enum type. The value's place in the enum's ordering is not affected."* ([PG ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html)).

drizzle-kit **does not emit it**. Renaming `'drink'` → `'beverage'` produced the identical destructive recreate as a removal (verified), which fails on any existing `'drink'` row. drizzle-kit's rename support is for the **enum type name and schema**, not for values ([0.26.0 notes](https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.26.0)). Renaming a value is always a hand-written migration:

```sql
ALTER TYPE "public"."item_kind" RENAME VALUE 'drink' TO 'beverage';
```

…and then you must resync the drizzle-kit snapshot (easiest: let it generate the bad migration, replace its body with the line above, keep the snapshot).

### Enum vs lookup table

| | `pgEnum` | `categories` table + FK |
| --- | --- | --- |
| Add a value | clean `ADD VALUE` (but unusable in same txn) | plain `INSERT` |
| Rename a value | destructive recreate; hand-edit | `UPDATE` one row |
| Remove a value | impossible in PG; drizzle recreates and fails on live data | `DELETE` (FK tells you what still references it) |
| Extra attributes (display name, sort order, description, parent) | none — a label is just a string | arbitrary columns |
| Hierarchy | impossible | trivial (self-FK) |
| Ordering | enum sort order is declaration order | explicit `sort_order` column |
| Referential integrity | type-level | FK |
| Type-safety in TS | `'dish' | 'ingredient' | 'drink'` union, for free | none — it's an `integer` |

Enums are worth it for genuinely closed, never-renamed sets (e.g. `item_kind` = dish / ingredient / drink). For anything that is *editorial data* — which a food taxonomy is — the lookup table wins.

---

## 2. Constraints and indexes — the current array-returning API

The current form is `(table) => [ … ]`. The object-returning form (`(table) => ({ … })`) is the older style; the docs now show only the array form ([indexes & constraints](https://orm.drizzle.team/docs/indexes-constraints)). All of the below is one file that `drizzle-kit generate` accepted and Postgres applied.

```ts
import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, text, integer, uuid, boolean, timestamp,
  primaryKey, foreignKey, unique, uniqueIndex, index, check,
  type AnyPgColumn, customType,
} from 'drizzle-orm/pg-core';

export const itemKind = pgEnum('item_kind', ['dish', 'ingredient', 'drink']);

export const categories = pgTable('categories', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull(),
  name: text().notNull(),
  parentId: integer('parent_id')
    .references((): AnyPgColumn => categories.id, { onDelete: 'restrict' }),
  depth: integer().notNull().default(0),
}, (t) => [
  uniqueIndex('categories_slug_uq').on(t.slug),                              // unique index
  check('categories_depth_nonneg', sql`${t.depth} >= 0`),                    // CHECK
  index('categories_parent_idx').on(t.parentId)                              // partial index
    .where(sql`${t.parentId} is not null`),
  index('categories_name_lower_idx').using('btree', sql`lower(${t.name})`),  // expression index
]);

export const items = pgTable('items', {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull(),
  name: text().notNull(),
  kind: itemKind().notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('items_slug_uq').on(t.slug),                                        // named UNIQUE constraint
  check('items_slug_lower', sql`${t.slug} = lower(${t.slug})`),
]);

export const itemCountries = pgTable('item_countries', {
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  countryCode: text('country_code').notNull().references(() => countries.code),
  isOrigin: boolean('is_origin').notNull().default(false),
  note: text(),
}, (t) => [
  primaryKey({ columns: [t.itemId, t.countryCode] }),                        // composite PK
  index('item_countries_country_idx').on(t.countryCode),
]);
```

Emitted SQL (verbatim from `drizzle/0000_init.sql`, verified applied):

```sql
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"path" "ltree",
	"depth" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_depth_nonneg" CHECK ("categories"."depth" >= 0)
);
--> statement-breakpoint
CREATE TABLE "item_countries" (
	"item_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"is_origin" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "item_countries_item_id_country_code_pk" PRIMARY KEY("item_id","country_code")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"category_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_slug_uq" UNIQUE("slug"),
	CONSTRAINT "items_slug_lower" CHECK ("items"."slug" = lower("items"."slug"))
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_path_gist" ON "categories" USING gist ("path" gist_ltree_ops);--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id") WHERE "categories"."parent_id" is not null;--> statement-breakpoint
CREATE INDEX "categories_name_lower_idx" ON "categories" USING btree (lower("name"));
```

Notes:

- **Partial index `WHERE` clause is emitted verbatim from your `sql` template**, including the qualified `"categories"."parent_id"`. Postgres accepts it, but be aware the string is passed straight through — drizzle-kit does not validate it.
- **Expression index** works via `sql\`lower(${t.name})\`` inside `.using('btree', …)`. Note that Drizzle renders the table-qualified name in `CHECK` but the bare column name inside the index expression — that is Drizzle's rendering, not something you control.
- **CHECK constraint changes ARE diffed.** Changing `sql\`${t.depth} >= 0\`` to `sql\`${t.depth} between 0 and 5\`` produced (verified):
  ```sql
  ALTER TABLE "categories" DROP CONSTRAINT "categories_depth_nonneg";--> statement-breakpoint
  ALTER TABLE "categories" ADD CONSTRAINT "categories_depth_nonneg" CHECK ("categories"."depth" between 0 and 5);
  ```
- **Unique with `NULLS NOT DISTINCT`** (PG 15+) per [the docs](https://orm.drizzle.team/docs/indexes-constraints): `unique().on(t.id).nullsNotDistinct()` or `integer().unique("custom_name", { nulls: "not distinct" })`. *Unverified locally* — I did not exercise this path.
- Full index modifier surface per the docs: `.concurrently()`, `.where(sql\`\`)`, `.with({ fillfactor: '70' })`, `.onOnly(...)`, `.op('text_ops')`, `.asc()/.desc()/.nullsFirst()/.nullsLast()`.
- `.concurrently()` cannot run inside a transaction block in Postgres, and Drizzle's migrator wraps everything in one — so a `CREATE INDEX CONCURRENTLY` migration will need to be applied outside `drizzle-kit migrate`. **Unverified** (I did not test it), but it follows directly from the migrator source quoted in §1 plus Postgres's `CREATE INDEX CONCURRENTLY` rules.

---

## 3. Self-referencing FK for an adjacency list

### The TypeScript circularity problem

The docs state it plainly: *"If you want to do a self reference, due to a TypeScript limitations you will have to either explicitly set return type for reference callback or use a standalone `foreignKey` operator."* ([indexes & constraints](https://orm.drizzle.team/docs/indexes-constraints)).

Without a workaround, `parentId: integer('parent_id').references(() => categories.id)` inside `categories`'s own definition makes `categories`' type depend on itself. (I did not run `tsc` to capture the exact diagnostic text — the specific error message is **unverified**; the requirement for the workaround is documented and I used it.)

### Workaround A — `AnyPgColumn` return annotation (verified)

```ts
import { pgTable, integer, text, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const categories = pgTable('categories', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
  parentId: integer('parent_id')
    .references((): AnyPgColumn => categories.id, { onDelete: 'restrict' }),
});
```

→ `ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;`

### Workaround B — standalone `foreignKey()` in the table extras (documented)

```ts
export const categories = pgTable('categories', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  parentId: integer('parent_id'),
}, (table) => [
  foreignKey({
    columns: [table.parentId],
    foreignColumns: [table.id],
    name: 'categories_parent_fk',
  }).onDelete('restrict'),
]);
```

This is also what `drizzle-kit pull` generates for a self-FK (verified — pull emitted exactly this shape). Prefer B when you want to name the constraint; A reads better inline.

### Relations for `parent` / `children` — needs `relationName`

Both sides point at the same table, so Drizzle cannot disambiguate them without an explicit `relationName` (verified working):

```ts
import { relations } from 'drizzle-orm';

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_tree',
  }),
  children: many(categories, { relationName: 'category_tree' }),
}));
```

Verified query result (one level up):

```jsonc
"category": {
  "id": 2, "slug": "stirfried-noodles", "name": "Stir-fried noodles", "parentId": 1,
  "parent": { "id": 1, "slug": "noodles", "name": "Noodles", "parentId": null }
}
```

### The limit: no recursive traversal

`db.query` cannot express arbitrary depth. For a full subtree you drop to raw SQL (verified working):

```ts
const tree = await db.execute(sql`
  with recursive t as (
    select id, slug, parent_id, 1 as depth from categories where parent_id is null
    union all
    select c.id, c.slug, c.parent_id, t.depth + 1 from categories c join t on c.parent_id = t.id
  ) select * from t order by depth`);
// [ { id: 1, slug: 'noodles', parent_id: null, depth: 1 },
//   { id: 2, slug: 'stirfried-noodles', parent_id: 1, depth: 2 } ]
```

`db.execute()` returns untyped rows (`snake_case` keys, as shown). Drizzle has **no** `WITH RECURSIVE` builder — `$with`/`with()` exists for plain CTEs but I found no `withRecursive` in the docs or the installed typings (**unverified negative**: absence of a documented feature, not a documented absence).

---

## 4. Extensions and custom types: `ltree`, `citext`, and UUIDs

### `CREATE EXTENSION` is your problem, not drizzle-kit's

Drizzle's own extension docs: *"There is no specific code to create an extension inside the Drizzle schema. We assume that if you are using vector types, indexes, and queries, you have a PostgreSQL database with the pg_vector extension installed."* ([extensions/pg](https://orm.drizzle.team/docs/extensions/pg)). First-party extension support is limited to **pg_vector** and **PostGIS**.

Verified for `citext`/`ltree`: the generated `0000_init.sql` contains no `CREATE EXTENSION` and dies immediately:

```
CREATE TYPE
ERROR:  type "citext" does not exist
LINE 3:  "slug" "citext" NOT NULL,
```

After `CREATE EXTENSION citext; CREATE EXTENSION ltree;` the identical file applied cleanly. **Escape hatch required:** hand-write a first migration.

```sql
-- drizzle/0000_extensions.sql   (hand-written, committed, ordered first)
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS ltree;
```

…and add a matching entry to `drizzle/meta/_journal.json`. (Simpler in practice for a Docker Compose project: put the extension DDL in `docker-entrypoint-initdb.d/` so every fresh container has it — see §6.)

### `ltree` via `customType` — works, but no operators

```ts
import { customType } from 'drizzle-orm/pg-core';

export const ltree = customType<{ data: string; driverData: string }>({
  dataType() { return 'ltree'; },
});

export const categories = pgTable('categories', {
  path: ltree('path'),
}, (t) => [
  index('categories_path_gist').using('gist', t.path.op('gist_ltree_ops')),
]);
```

Emitted (verified): `"path" "ltree"` and `CREATE INDEX "categories_path_gist" ON "categories" USING gist ("path" gist_ltree_ops);` — the GiST index with the ltree operator class works.

The cost is querying. There is no `isDescendantOf()` helper; every ltree operator is a raw fragment (verified working):

```ts
const desc = await db
  .select({ id: categories.id, path: categories.path })
  .from(categories)
  .where(sql`${categories.path} <@ ${'noodles'}::ltree`);
// [ { id: 1, path: 'noodles' }, { id: 2, path: 'noodles.stirfried' } ]
```

Note you must write the `::ltree` cast yourself — the parameter binds as text. No type-checking of `lquery`/`ltxtquery` strings.

### `citext` via `customType` — works, cheaper

```ts
export const citext = customType<{ data: string; driverData: string }>({
  dataType() { return 'citext'; },
});
```

Unlike ltree, citext needs no operator support: case-insensitivity is in the type, so ordinary Drizzle predicates just work (verified):

```ts
await db.select({ slug: categories.slug }).from(categories)
  .where(eq(categories.slug, 'NOODLES'));
// [ { slug: 'noodles' } ]
```

`drizzle-kit push` reported **"No changes detected"** against a live DB containing these columns (verified) — so `customType` columns don't cause diff churn.

### But `drizzle-kit pull` cannot read them back

Verified output of `drizzle-kit pull` against the applied schema:

```ts
export const categories = pgTable("categories", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ /* … */ }),
	// TODO: failed to parse database type 'citext'
	slug: unknown("slug").notNull(),
	name: text().notNull(),
	parentId: integer("parent_id"),
	// TODO: failed to parse database type 'ltree'
	path: unknown("path"),
	depth: integer().default(0).notNull(),
}, (table) => [ /* indexes, FKs and checks all round-tripped fine */ ]);
```

`unknown(...)` is not importable — the pulled file does not compile. Indexes, operator classes, partial-index `WHERE`, FKs and CHECKs all round-tripped correctly; only the custom types did not. If you never run `pull`, this doesn't matter.

### UUID generation

| Option | SQL emitted (verified) | Notes |
| --- | --- | --- |
| `uuid().defaultRandom()` | `DEFAULT gen_random_uuid()` | v4. `gen_random_uuid()` is built into Postgres (no `pgcrypto` needed on modern versions) and documented as *"Generates a version 4 (random) UUID"* ([PG uuid functions](https://www.postgresql.org/docs/current/functions-uuid.html)). Docs also note you can write `sql\`gen_random_uuid()\`` explicitly ([column types](https://orm.drizzle.team/docs/column-types/pg)). |
| `uuid().default(sql\`uuidv7()\`)` | `DEFAULT uuidv7()` | **v7, time-ordered.** `uuidv7()` and `uuidv4()` are listed in the PG 18 function reference ([PG uuid functions](https://www.postgresql.org/docs/current/functions-uuid.html)). Drizzle has **no** `defaultUuidV7()` helper — `sql\`\`` is the escape hatch. Verified end to end: `select uuidv7()` → `01a07d41-b8e4-7a40-b379-1fe5d498b0eb`. **Requires PG ≥ 18** — the PG 18 page does not state which version introduced it, so pin the Docker image. |
| `uuid().$defaultFn(() => crypto.randomUUID())` | *(no `DEFAULT` at all)* | App-side only. Verified: the emitted DDL is bare `"id" uuid PRIMARY KEY NOT NULL`. Anything inserting outside your app (psql, a seed script that bypasses Drizzle) gets a NOT NULL violation. |

**Recommendation shape:** DB-side defaults survive raw `INSERT`s; app-side ones don't. For a reference dataset you will occasionally load by hand, prefer a DB default.

---

## 5. Many-to-many with payload columns, and `relations`

### Which API version

**v0.45.2 ships `relations()` only.** `defineRelations` does not exist in the installed package (verified by grep). The docs site shows `defineRelations` because it documents v1 ([relations docs](https://orm.drizzle.team/docs/relations), [v1→v2 guide](https://orm.drizzle.team/docs/relations-v1-v2)). In v1, the old function survives as `import { relations } from "drizzle-orm/_relations"` but **RQBv1 (the `db.query` engine that consumes it) is removed** ([v0→v1 changes](https://orm.drizzle.team/docs/v0-v1-changes)) — so the old relations do *not* keep working for querying after an upgrade.

### v0 form (what you will write) — verified end to end

Schema (junction with payload):

```ts
export const itemCountries = pgTable('item_countries', {
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  countryCode: text('country_code').notNull().references(() => countries.code),
  isOrigin: boolean('is_origin').notNull().default(false),   // ← payload
  note: text(),                                              // ← payload
}, (t) => [
  primaryKey({ columns: [t.itemId, t.countryCode] }),
  index('item_countries_country_idx').on(t.countryCode),
]);
```

Relations — note you declare **three**: both sides to the junction, and the junction's two `one`s:

```ts
import { relations } from 'drizzle-orm';

export const itemsRelations = relations(items, ({ one, many }) => ({
  category: one(categories, { fields: [items.categoryId], references: [categories.id] }),
  itemCountries: many(itemCountries),
}));

export const countriesRelations = relations(countries, ({ many }) => ({
  itemCountries: many(itemCountries),
}));

export const itemCountriesRelations = relations(itemCountries, ({ one }) => ({
  item: one(items, { fields: [itemCountries.itemId], references: [items.id] }),
  country: one(countries, { fields: [itemCountries.countryCode], references: [countries.code] }),
}));
```

Wire the relations into the client (they must be in the `schema` object, or `db.query` won't see them):

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';
import * as rel from './relations.ts';

const db = drizzle(process.env.DATABASE_URL!, { schema: { ...schema, ...rel } });
```

Query — payload columns come back because you traverse the junction explicitly:

```ts
const res = await db.query.items.findMany({
  with: {
    category: { with: { parent: true } },
    itemCountries: {
      columns: { isOrigin: true, note: true },   // ← the payload
      with: { country: true },
    },
  },
});
```

Verified output:

```jsonc
"itemCountries": [
  { "isOrigin": true,  "note": "street food staple", "country": { "code": "TH", "name": "Thailand" } },
  { "isOrigin": false, "note": null,                 "country": { "code": "KR", "name": "South Korea" } }
]
```

The result is one nesting level deeper than a "pure" m2m (`item.itemCountries[].country` rather than `item.countries[]`). That extra level is exactly where the payload lives, so for a join table **with** payload it is the shape you want.

### v1 form, for when you upgrade

```ts
import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

export const relations = defineRelations(schema, (r) => ({
  items: {
    countries: r.many.countries({
      from: r.items.id.through(r.itemCountries.itemId),
      to: r.countries.code.through(r.itemCountries.countryCode),
    }),
  },
}));
```

`through()` **hides the junction table**, and the docs I read do not show any way to project its payload columns into that flattened result ([relations docs](https://orm.drizzle.team/docs/relations), [v1→v2 guide](https://orm.drizzle.team/docs/relations-v1-v2)). My reading: for a payload-bearing junction you would still declare an ordinary `r.many.itemCountries()` relation and nest through it, exactly as in v0 — but **I could not confirm this from a primary source and did not test it** (v1 is an RC). Treat as **unverified**. This is a real reason not to rush the v1 upgrade.

---

## 6. Migration workflow

Per the [kit overview](https://orm.drizzle.team/docs/kit-overview) and the [migrations concepts page](https://orm.drizzle.team/docs/migrations):

| Command | What it is for |
| --- | --- |
| `generate` | Diff schema against the last snapshot, write a `.sql` migration file. Does not touch a database. |
| `migrate` | Apply pending `.sql` migration files to a database; records them in `drizzle.__drizzle_migrations`. |
| `push` | Diff schema directly against a **live database** and apply the difference immediately. No SQL files. *"the best approach for rapid prototyping"* ([push docs](https://orm.drizzle.team/docs/drizzle-kit-push)). |
| `pull` | Introspect an existing database into `schema.ts` + `relations.ts` + a baseline `.sql`. Database-first / adopting an existing DB. |
| `check` | *"walk through all generate[d] migrations and check for any race conditions(collisions)"* — run before committing when two branches both generated migrations. |
| `up` | Upgrade snapshots of previously generated migrations after a drizzle-kit version bump. |

### What `generate` actually produces in 0.31.10 (verified)

```
drizzle/
├ 0000_init.sql
├ 0001_change_check.sql
└ meta/
  ├ _journal.json
  ├ 0000_snapshot.json
  └ 0001_snapshot.json
```

`_journal.json`:

```json
{ "version": "7", "dialect": "postgresql",
  "entries": [ { "idx": 0, "version": "7", "when": 1788807389272, "tag": "0000_init", "breakpoints": true }, … ] }
```

Statements are separated by `--> statement-breakpoint` markers, which the migrator splits on.

### What belongs in version control

**Commit the entire `drizzle/` directory** — the `.sql` files *and* `meta/`. Reasoning (this is inference from observed behaviour, because I could not find a page that states it in so many words — flagging that honestly):

- `generate` diffs against `meta/NNNN_snapshot.json`. Without the snapshots, the next `generate` on a fresh clone re-emits your whole schema as migration 0000.
- `migrate` reads `meta/_journal.json` to know the order and timestamps.
- `check` needs the snapshots to detect collisions.

The docs render the generated tree as a persisted project artifact ([generate docs](https://orm.drizzle.team/docs/drizzle-kit-generate)) but stop short of an explicit "commit this" sentence. **Unverified as a direct quote; verified as a mechanical requirement.**

`drizzle.config.ts` is committed. The DB URL comes from `.env` (gitignored).

### Recommended flow for vore-db (Docker Compose Postgres)

`push` is tempting for a solo prototype, and the docs endorse it. Don't use it as the primary flow here, for two specific reasons found above:

1. `push` produces no artifact, so the destructive enum-recreate and the missing `CREATE EXTENSION` are silent rather than reviewable.
2. The whole point of this project is a schema you can reason about later. Migration files are the record.

Suggested setup:

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './backend/src/db/schema.ts',
  out: './backend/drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:18.1-alpine       # pin: uuidv7() needs PG 18
    environment: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: vore }
    ports: ["5432:5432"]
    volumes:
      - ./backend/db/init:/docker-entrypoint-initdb.d:ro   # CREATE EXTENSION lives here
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHORT", "pg_isready -U postgres"]
volumes: { pgdata: {} }
```

```sql
-- backend/db/init/01-extensions.sql  (only if you actually adopt citext/ltree)
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS ltree;
```

Loop: edit `schema.ts` → `drizzle-kit generate --name <what_changed>` → **read the generated SQL** → `drizzle-kit migrate` → `tsx seed.ts` → commit schema + migration + snapshot together.

Nuking the volume and re-migrating from zero is cheap at this size and is the fastest recovery from a bad migration. Use `push` only for throwaway spikes on a database you are willing to drop.

---

## 7. Seeding: `drizzle-seed` vs a plain `db.insert()` script

### What `drizzle-seed` does

Per the [seed overview](https://orm.drizzle.team/docs/seed-overview): generates *"deterministic, yet realistic, fake data"* from a seedable pRNG — the same `seed` number always yields the same rows. API surface: `seed(db, schema, { count, seed })`, `.refine((f) => ({ table: { count, columns, with } }))`, `reset(db, schema)`, generators like `f.fullName()`, `f.valuesFromArray()`, `f.int()`, and `f.weightedRandom([{ weight, value }, …])`.

```ts
await seed(db, schema, { count: 1000, seed: 12345 }).refine((f) => ({
  users: {
    count: 20,
    columns: { name: f.fullName() },
    with: { posts: 10 },
  },
}));
```

Documented limitations ([seed overview](https://orm.drizzle.team/docs/seed-overview)): `with` only expresses one-to-many (not the reverse); TypeScript cannot fully infer table references for `with` under circular dependencies; seeding fails when two composite unique constraints share a column; non-unique generators need explicit `isUnique`.

### Verified behaviour on a vore-db-shaped schema

**It refuses `customType` columns outright.** Running it against the schema in §2 (which has a `citext` slug):

```
SEED ERROR: column with type citext is not supported for now.
```

On a plain schema (`text`/`uuid`/`pgEnum`/FK) it works, and the output shows exactly why it is the wrong tool here:

```js
[ { id: '82e8ff72-…', name: 'Pad thai',  kind: 'ingredient', categoryId: 3 },
  { id: '02558988-…', name: 'Eggplant',  kind: 'drink',      categoryId: 2 },
  { id: '3341dae8-…', name: 'Negroni',   kind: 'drink',      categoryId: 2 },
  { id: 'fe983326-…', name: 'Pad thai',  kind: 'drink',      categoryId: 1 } ]
[ { id: 1, name: 'Cocktails' }, { id: 2, name: 'Cocktails' }, { id: 3, name: 'Noodles' } ]
```

Even with `f.valuesFromArray()` pinning the candidate values, it produced **Eggplant as a drink**, **Pad thai twice**, and two categories both named "Cocktails". It samples each column independently — it has no concept of a *correlated* row. That is fundamental to what the library is, not a bug.

Two smaller observations from the same run: it generated client-side UUIDs rather than letting the `DEFAULT gen_random_uuid()` fire (some of which are not RFC-4122-variant-conformant — Postgres's `uuid` type doesn't validate that, so they store fine), and `reset()` did truncate cleanly.

### Recommendation: plain `db.insert()`

For ~10 hand-picked canonical rows, `drizzle-seed` is the wrong shape. Write a script:

```ts
// backend/src/db/seed.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema.ts';

const db = drizzle(process.env.DATABASE_URL!, { schema });

await db.execute(sql`truncate table ${schema.itemCountries}, ${schema.items}, ${schema.categories}, ${schema.countries} restart identity cascade`);

const [noodles] = await db.insert(schema.categories)
  .values({ slug: 'noodles', name: 'Noodles' }).returning();
const [stirFried] = await db.insert(schema.categories)
  .values({ slug: 'stir-fried-noodles', name: 'Stir-fried noodles', parentId: noodles!.id }).returning();

await db.insert(schema.countries).values([
  { code: 'TH', name: 'Thailand' },
  { code: 'KR', name: 'South Korea' },
]);

const [padThai] = await db.insert(schema.items)
  .values({ slug: 'pad-thai', name: 'Pad thai', kind: 'dish', categoryId: stirFried!.id })
  .returning();

await db.insert(schema.itemCountries).values([
  { itemId: padThai!.id, countryCode: 'TH', isOrigin: true, note: 'street food staple' },
]);
```

Why it wins here: the data *is* the content (a reference encyclopedia's rows are curated, not generated); `.returning()` gives you the generated ids to wire FKs; it exercises the same code path the app uses, so it doubles as a smoke test of the schema; it works with `customType` columns; and it is fewer lines than the `refine()` block that still wouldn't produce correct data. `drizzle-seed` becomes worth reaching for if you later need thousands of rows for pagination or index-performance work — keep it in mind, don't adopt it now.

---

## Recommendations for vore-db

1. **Category: lookup table, not `pgEnum`.** 🚩 This is the taxonomy gate. Enum value renames and removals are hand-edited destructive migrations in drizzle-kit and impossible-to-drop in Postgres. A `categories` table gives you rename-by-UPDATE, a `sort_order`, a display `name` separate from a stable `slug`, and a place to hang a parent. Keep `pgEnum` **only** for `item_kind` (`dish | ingredient | drink`) — a genuinely closed set where the TS union is worth having. Even there, plan on `ADD VALUE` only.

2. **Hierarchy: adjacency list, not `ltree`.** Self-FK + `AnyPgColumn` + `relationName`, verified working. A food taxonomy is shallow (Cuisine → Course → Dish-type); one or two levels of `with: { parent: true }` covers the browse UI, and a 6-line recursive CTE covers anything deeper. `ltree` costs you: a hand-written `CREATE EXTENSION` migration, `customType`, raw `sql\`\`` for every operator, a non-compiling `drizzle-kit pull`, and `drizzle-seed` refusing the column — in exchange for subtree queries you can already write as a CTE. Revisit only if the tree gets deep *and* subtree filtering becomes a hot path. Optionally add a `depth integer` and a materialized `path text` maintained in the app for cheap breadcrumbs, without the extension.

3. **`citext`: skip it too.** It's the cheapest of the custom types (no operator problem), but it still breaks `pull` and `drizzle-seed`. Use `text` for `slug` with a `CHECK (slug = lower(slug))` and a plain unique index — verified working, zero extensions. Keep `citext` in your pocket if case-insensitive *name* lookup becomes a real requirement.

4. **Primary keys: `integer generated always as identity` for `categories` and `countries`; `uuid` for `items` if you ever expect distributed authoring, otherwise identity there too.** Drizzle emits the full identity clause correctly. If you do choose UUID, use `uuid().default(sql\`uuidv7()\`)` (time-ordered, better index locality) and pin `postgres:18` — `uuidv7()` is in the PG 18 function reference. Don't use `$defaultFn(crypto.randomUUID)`: it emits no DB default, so any hand-written `INSERT` fails. Avoid `serial` in favour of identity columns (standard SQL, cleaner ownership semantics).

5. **`generate` + `migrate`, not `push`.** Commit all of `backend/drizzle/` including `meta/`. Read every generated `.sql` before applying — this whole document exists because the generated SQL is not always right. Run `drizzle-kit check` before committing if you ever branch.

6. **Extensions (if you overrule #2/#3): `docker-entrypoint-initdb.d/`, not a migration.** Simpler than hand-splicing `_journal.json`, and it makes a fresh `docker compose up` self-sufficient. The tradeoff is that the extension requirement then lives outside the migration history — document it in the README.

7. **Seed with a plain `db.insert()` script.** See §7.

8. **Do not upgrade to `1.0.0-rc.*` until v1 is `latest`.** RQBv1 is removed in v1, so the relations file in §5 has to be rewritten, and whether v1's `through()` can project junction payload is unverified.

   `backend/package.json` currently carries `^0.45.2` / `^0.31.10`. That is already safe against the v1 jump — npm caret ranges on a `0.x` version are restricted to that minor (`>=0.45.2 <0.46.0`), so the caret cannot reach `1.0.0` on its own. Exact pins would buy a little more reproducibility, but the important thing is a comment next to the dep saying **the docs site documents v1 while this is v0**.

---

## Sources

Primary sources consulted. Everything not attributable to one of these was reproduced locally against `drizzle-orm@0.45.2` / `drizzle-kit@0.31.10` / `drizzle-seed@0.3.1` / `postgres:18.1-alpine` and is labelled "verified" in the text.

Drizzle ORM official documentation:
- https://orm.drizzle.team/docs/column-types/pg
- https://orm.drizzle.team/docs/indexes-constraints
- https://orm.drizzle.team/docs/custom-types
- https://orm.drizzle.team/docs/extensions/pg
- https://orm.drizzle.team/docs/relations
- https://orm.drizzle.team/docs/rqb
- https://orm.drizzle.team/docs/relations-v1-v2
- https://orm.drizzle.team/docs/v0-v1-changes
- https://orm.drizzle.team/docs/relations-schema-declaration
- https://orm.drizzle.team/docs/kit-overview
- https://orm.drizzle.team/docs/migrations
- https://orm.drizzle.team/docs/drizzle-kit-generate
- https://orm.drizzle.team/docs/drizzle-kit-push
- https://orm.drizzle.team/docs/seed-overview

drizzle-team/drizzle-orm GitHub (release notes / issues):
- https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.26.0 — authoritative statement of Postgres enum add/drop/rename behaviour
- https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.26.2
- https://github.com/drizzle-team/drizzle-orm/issues/4295 — enum change with column default

PostgreSQL official documentation:
- https://www.postgresql.org/docs/current/sql-altertype.html — `ADD VALUE` / `RENAME VALUE`, transaction-block rule, no `DROP VALUE`
- https://www.postgresql.org/docs/current/functions-uuid.html — `gen_random_uuid()`, `uuidv4()`, `uuidv7()`

Shipped package source (read from `node_modules`, i.e. the artifact itself):
- `drizzle-orm@0.45.2/pg-core/dialect.cjs` — `migrate()` wraps all pending migrations in one transaction
- `drizzle-orm@0.45.2/relations.d.ts` — exports `relations`, not `defineRelations`
- `drizzle-orm@1.0.0-rc.4/relations.d.ts` and `_relations.d.ts` — `defineRelations` (new) alongside legacy `relations`

npm registry (`npm view … dist-tags`) for the version table.
