/**
 * Drizzle schema for vore-db — the v1 shape.
 *
 * Every table here implements a decision recorded on map #1. Where a comment cites an
 * ADR, that document holds the reasoning and the options that were rejected:
 *
 *   ADR-0001  country is the only origin axis, keyed by its ISO 3166-1 alpha-2 code
 *   ADR-0002  every item has at least one `origin` country, enforced at COMMIT
 *   ADR-0003  one `item` table, an adjacency-list `category` tree, grouped `tag`s
 *   ADR-0004  one canonical `item.name` column, every other name an `item_name` row
 *   ADR-0005  images are external references, ordered, optional
 *
 * Table conventions (map #1 left these open; settled here):
 *
 *   - Surrogate keys are `integer generated always as identity`. The dataset is an
 *     encyclopedia authored in one place, so there is no distributed-authoring case for
 *     UUIDs, and identity columns keep every foreign key four bytes and readable in psql.
 *     `country` and `media_licence` are the exceptions: both are closed reference lists
 *     whose own natural code carries identity (ADR-0001, ADR-0005).
 *   - `slug` is the stable public handle on every table that has one: lowercase, unique,
 *     `^[a-z0-9]+(-[a-z0-9]+)*$`, enforced by CHECK. Ids never appear in a URL.
 *   - `created_at` / `updated_at` are `timestamptz not null default now()` on the tables
 *     that hold editorial content. `updated_at` is maintained by a `set_updated_at`
 *     trigger, so it is true regardless of who writes. Reference tables (`country`,
 *     `media_licence`) and pure join tables (`item_tag`, `item_country`) carry neither:
 *     the first are seeded verbatim, the second are edges whose lifetime is the item's.
 *   - No soft delete. Deleting an item deletes its names, images and edges by cascade.
 *   - Table names are singular; `casing: 'snake_case'` in drizzle.config.ts maps camelCase
 *     fields to snake_case columns, so no column needs a name of its own.
 *
 * Three rules are enforced by hand-written triggers in `drizzle/0001_triggers.sql`,
 * because drizzle-kit cannot express them: the origin rule (ADR-0002), the alias-never-
 * restates-the-name rule (ADR-0004), and `updated_at` maintenance.
 */
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/** A slug is the public handle: lowercase, digits, single hyphens between segments. */
const SLUG_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$'

const auditColumns = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}

// ---------------------------------------------------------------------------
// Enums
//
// Both sets are closed by CONTEXT.md rather than by convenience, which is what makes an
// enum safe here: the Drizzle research (#6) found that removing or renaming an enum value
// emits SQL that fails on live data, so a `pgEnum` is only ever an `ADD VALUE` away from a
// hand-edited migration. `media_licence` is a lookup table for exactly that reason —
// licences are a growing list, and a licence has attributes an enum label cannot carry.
// ---------------------------------------------------------------------------

/** ADR-0002: what an item's association with a country means. */
export const originRole = pgEnum('origin_role', ['origin', 'national_dish', 'popular_in'])

/** ADR-0004: what sort of alias an `item_name` row is. */
export const nameKind = pgEnum('name_kind', ['native', 'romanisation', 'synonym', 'historical'])

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/**
 * ADR-0001. Closed: current ISO 3166-1 officially assigned entries only, seeded verbatim
 * and never hand-edited. The alpha-2 code is the primary key, so joins read as
 * `country_code = 'JP'` and `/country/jp` needs no lookup.
 */
export const country = pgTable('country', {
  code: char({ length: 2 }).primaryKey(),
  name: text().notNull(),
}, t => [
  unique('country_name_uq').on(t.name),
  check('country_code_upper', sql`${t.code} ~ '^[A-Z]{2}$'`),
])

/**
 * ADR-0005. A closed set of licence codes, in ADR-0001's mould: keyed by its own natural
 * code, seeded from a reference list. `requiresAttribution` turns "which images are
 * missing a credit they owe" into a query rather than a per-licence judgement in code.
 */
export const mediaLicence = pgTable('media_licence', {
  code: text().primaryKey(),
  name: text().notNull(),
  url: text(),
  requiresAttribution: boolean().notNull(),
}, t => [
  check('media_licence_code_format', sql`${t.code} ~ '^[A-Za-z0-9][A-Za-z0-9.-]*$'`),
])

// ---------------------------------------------------------------------------
// Taxonomy — ADR-0003
// ---------------------------------------------------------------------------

/**
 * The single taxonomy. An adjacency list: `parentId` is NULL for the three roots
 * (`dish`, `ingredient`, `drink`) and points at another category otherwise. Depth is
 * ragged on purpose and an item may attach to an interior node, so nothing here pins a
 * level. `onDelete: 'restrict'` — a category with children or items is not deletable.
 */
export const category = pgTable('category', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull(),
  name: text().notNull(),
  parentId: integer().references((): AnyPgColumn => category.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, t => [
  unique('category_slug_uq').on(t.slug),
  check('category_slug_format', sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
  // A category cannot be its own parent. Longer cycles are not expressible as a CHECK;
  // the tree is authored, not user-generated, so review holds that line.
  check('category_parent_not_self', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  index('category_parent_idx').on(t.parentId).where(sql`${t.parentId} is not null`),
])

/** A family of related tags — diet, preparation, occasion. Every tag belongs to one. */
export const tagGroup = pgTable('tag_group', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull(),
  name: text().notNull(),
  ...auditColumns,
}, t => [
  unique('tag_group_slug_uq').on(t.slug),
  check('tag_group_slug_format', sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
])

/** A cross-cutting fact about an item that is not what the item *is*. */
export const tag = pgTable('tag', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull(),
  name: text().notNull(),
  groupId: integer().notNull().references(() => tagGroup.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, t => [
  unique('tag_slug_uq').on(t.slug),
  check('tag_slug_format', sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
  index('tag_group_idx').on(t.groupId),
])

// ---------------------------------------------------------------------------
// Item — ADR-0003
// ---------------------------------------------------------------------------

/**
 * One row is one canonical food or drink. No food/drink discriminator: `drink` is a
 * category root, so drink-ness is read off the taxonomy and cannot drift from it.
 * `name` is the one canonical English display name (ADR-0004); every other name is an
 * `item_name` row.
 */
export const item = pgTable('item', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull(),
  name: text().notNull(),
  description: text(),
  categoryId: integer().notNull().references(() => category.id, { onDelete: 'restrict' }),
  ...auditColumns,
}, t => [
  unique('item_slug_uq').on(t.slug),
  check('item_slug_format', sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
  check('item_name_not_blank', sql`length(btrim(${t.name})) > 0`),
  index('item_category_idx').on(t.categoryId),
])

/** An item's tags. No payload: the edge is the whole fact. */
export const itemTag = pgTable('item_tag', {
  itemId: integer().notNull().references(() => item.id, { onDelete: 'cascade' }),
  tagId: integer().notNull().references(() => tag.id, { onDelete: 'restrict' }),
}, t => [
  primaryKey({ columns: [t.itemId, t.tagId] }),
  index('item_tag_tag_idx').on(t.tagId),
])

// ---------------------------------------------------------------------------
// Origin — ADR-0001, ADR-0002
// ---------------------------------------------------------------------------

/**
 * The association between an item and a country, carrying what that association means.
 * The role is part of the key, so an item can be both *from* a country and hold up as
 * that country's national dish without the two facts fighting over one row.
 *
 * `isPrimary` marks the country shown first. It is optional — ćevapi is Bosnian, Serbian
 * and Croatian on equal footing and has none — and at most one row per item may carry it,
 * enforced by a partial unique index. It is restricted to `origin` rows: a country an item
 * is merely popular in is not the country to lead with.
 *
 * The rule that every item has at least one `origin` row is a deferred constraint trigger
 * in `drizzle/0001_triggers.sql`, not anything expressible here (ADR-0002).
 */
export const itemCountry = pgTable('item_country', {
  itemId: integer().notNull().references(() => item.id, { onDelete: 'cascade' }),
  countryCode: char({ length: 2 }).notNull().references(() => country.code, { onDelete: 'restrict' }),
  role: originRole().notNull(),
  isPrimary: boolean().notNull().default(false),
}, t => [
  primaryKey({ columns: [t.itemId, t.countryCode, t.role] }),
  check('item_country_primary_is_origin', sql`not ${t.isPrimary} or ${t.role} = 'origin'`),
  uniqueIndex('item_country_one_primary_uq').on(t.itemId).where(sql`${t.isPrimary}`),
  // Browse-by-country is the primary read: every item from JP, in role order.
  index('item_country_country_idx').on(t.countryCode, t.role),
])

// ---------------------------------------------------------------------------
// Names — ADR-0004
// ---------------------------------------------------------------------------

/**
 * Every name an item goes by other than its canonical one: the native script, its
 * romanisation, a regional synonym, a historical name. `kind` and `lang` are split so
 * 寿司 and *sushi* stay distinguishable without depending on the `-Latn` subtag; `lang`
 * is nullable because a romanisation genuinely has no language of its own.
 *
 * Names are unique within an item, case-insensitively, via a `lower(value)` expression
 * index — not `citext`, which would need a hand-written `CREATE EXTENSION` drizzle-kit
 * never emits. They repeat freely across items: a drink and a romanisation both spelled
 * "gin" is an ordinary collision, and `slug` is the global handle.
 *
 * That an alias never restates its item's own name needs both tables and so lives in
 * `drizzle/0001_triggers.sql`.
 */
export const itemName = pgTable('item_name', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  itemId: integer().notNull().references(() => item.id, { onDelete: 'cascade' }),
  value: text().notNull(),
  kind: nameKind().notNull(),
  lang: text(),
  ...auditColumns,
}, t => [
  check('item_name_value_not_blank', sql`length(btrim(${t.value})) > 0`),
  check('item_name_lang_bcp47', sql`${t.lang} is null or ${t.lang} ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$'`),
  uniqueIndex('item_name_value_uq').using('btree', t.itemId, sql`lower(${t.value})`),
  // Alias resolution — "what item is this string a name for" — reads this index.
  index('item_name_lower_value_idx').using('btree', sql`lower(${t.value})`),
])

// ---------------------------------------------------------------------------
// Images — ADR-0005
// ---------------------------------------------------------------------------

/**
 * A picture of an item, held as a reference to a file hosted elsewhere; this project
 * stores no bytes. `url` is where the bytes are, `sourcePageUrl` the page they came from
 * — the Wikimedia Commons file page carrying the licence and the author, and the thing an
 * attribution line links to.
 *
 * The primary image is the lowest `position`, not a flag, so ordering and primacy cannot
 * contradict each other. `altText` is the only editorial field required; licence,
 * attribution and source page are nullable, and the convention — not enforced — is that a
 * row without a licence is not publishable.
 */
export const itemImage = pgTable('item_image', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  itemId: integer().notNull().references(() => item.id, { onDelete: 'cascade' }),
  url: text().notNull(),
  altText: text().notNull(),
  position: integer().notNull(),
  caption: text(),
  licenceCode: text().references(() => mediaLicence.code, { onDelete: 'restrict' }),
  attribution: text(),
  sourcePageUrl: text(),
  ...auditColumns,
}, t => [
  check('item_image_position_nonneg', sql`${t.position} >= 0`),
  check('item_image_alt_text_not_blank', sql`length(btrim(${t.altText})) > 0`),
  // ADR-0005 flagged that reordering is a sequence of UPDATEs momentarily in conflict.
  // `drizzle/0001_triggers.sql` makes this one DEFERRABLE INITIALLY IMMEDIATE, which
  // drizzle-kit cannot express — so it costs nothing until a reordering transaction asks
  // for it with SET CONSTRAINTS.
  unique('item_image_position_uq').on(t.itemId, t.position),
  unique('item_image_url_uq').on(t.itemId, t.url),
])
