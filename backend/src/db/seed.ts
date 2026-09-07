/**
 * Seeds the reference tables and ten items chosen to stress the model.
 *
 *   pnpm db:seed
 *
 * Destructive and idempotent: it truncates everything first, so it can be run repeatedly
 * against a migrated database. Written as plain `db.insert()` calls rather than
 * `drizzle-seed` — the rows of a reference encyclopedia are curated content, not generated
 * fixtures, and `.returning()` gives back the identity ids the edges need (see #6, §7).
 *
 * Everything runs inside one transaction, which is the point: ADR-0002's origin rule is a
 * DEFERRABLE INITIALLY DEFERRED constraint trigger, so an item and its countries land
 * together and the rule is checked once at COMMIT.
 *
 * The ten items are picked for what they break, not for coverage:
 *
 *   pad thai    native script + romanisation, and one country in two roles at once
 *   sushi       attaches to a root category directly — items need not sit at a leaf
 *   kimchi      a dish that is also an ingredient in others; tagged, not re-categorised
 *   ćevapi      three co-equal origins and NO primary country
 *   phở         origin plus two `popular_in` countries
 *   negroni     a drink; `popular_in` alongside `origin`; carries no aliases at all
 *   gin         dual nature — a `drink` by category, tagged `ingredient` (ADR-0003)
 *   eggplant    two origins; regional synonyms that differ only by `lang` (en-GB, en-IN)
 *   gochujang   three levels deep in the taxonomy: ingredient > condiment > fermented paste
 *   mate        four co-equal origins, no primary, and `national_dish` without one
 */
import { sql } from 'drizzle-orm'
import { db, pool } from './client.ts'
import { COUNTRIES } from './reference/countries.ts'
import { LICENCES } from './reference/licences.ts'
import {
  category,
  country,
  item,
  itemCountry,
  itemImage,
  itemName,
  itemTag,
  mediaLicence,
  tag,
  tagGroup,
} from './schema.ts'

type Slug = string

/** The taxonomy, as `slug: [display name, parent slug or null]`. Ragged on purpose. */
const CATEGORIES: Record<Slug, readonly [name: string, parent: Slug | null]> = {
  dish: ['Dish', null],
  ingredient: ['Ingredient', null],
  drink: ['Drink', null],

  'noodle-dish': ['Noodle dish', 'dish'],
  'stir-fried-noodle-dish': ['Stir-fried noodle dish', 'noodle-dish'],
  soup: ['Soup', 'dish'],
  'grilled-dish': ['Grilled dish', 'dish'],
  'side-dish': ['Side dish', 'dish'],

  vegetable: ['Vegetable', 'ingredient'],
  condiment: ['Condiment', 'ingredient'],
  'fermented-paste': ['Fermented paste', 'condiment'],

  'alcoholic-drink': ['Alcoholic drink', 'drink'],
  cocktail: ['Cocktail', 'alcoholic-drink'],
  spirit: ['Spirit', 'alcoholic-drink'],
  infusion: ['Infusion', 'drink'],
}

/** Tag groups, and the tags in each. A tag says what an item is *also* true of. */
const TAG_GROUPS: ReadonlyArray<readonly [slug: Slug, name: string, tags: ReadonlyArray<readonly [Slug, string]>]> = [
  ['diet', 'Diet', [['vegan', 'Vegan'], ['vegetarian', 'Vegetarian']]],
  ['preparation', 'Preparation', [['fermented', 'Fermented'], ['grilled', 'Grilled'], ['stir-fried', 'Stir-fried']]],
  ['occasion', 'Occasion', [['street-food', 'Street food']]],
  ['composition', 'Composition', [['alcoholic', 'Alcoholic'], ['caffeinated', 'Caffeinated']]],
  // ADR-0003's dual-nature convention: gin is categorised where a reader looks for it
  // (a drink) and tagged for the other reading.
  ['role', 'Role', [['ingredient-use', 'Used as an ingredient']]],
]

type NameKind = 'native' | 'romanisation' | 'synonym' | 'historical'
type OriginRole = 'origin' | 'national_dish' | 'popular_in'

interface SeedItem {
  slug: Slug
  name: string
  description: string
  category: Slug
  countries: ReadonlyArray<readonly [code: string, role: OriginRole, isPrimary?: true]>
  names?: ReadonlyArray<readonly [value: string, kind: NameKind, lang?: string]>
  tags?: readonly Slug[]
  images?: ReadonlyArray<{
    url: string
    altText: string
    caption?: string
    licenceCode?: string
    attribution?: string
    sourcePageUrl?: string
  }>
}

// Image rows are illustrative placeholders on example.org, not real files — no photograph
// has been sourced or licence-checked yet. They exist so the seed exercises what the table
// is actually for: `position` ordering with no `is_primary` flag, the licence foreign key,
// and the audit an image with no licence is supposed to fail (ADR-0005).
const PLACEHOLDER = 'https://images.example.org/vore-db'

const ITEMS: readonly SeedItem[] = [
  {
    slug: 'pad-thai',
    name: 'Pad thai',
    description:
      'Rice noodles stir-fried with tamarind, fish sauce and palm sugar, with egg, tofu or prawns, '
      + 'finished with crushed peanuts and lime.',
    category: 'stir-fried-noodle-dish',
    // Thailand twice, in two roles: the country is *where it comes from* and the dish is
    // *held up as emblematic there*. Two facts, two rows, one composite key.
    countries: [['TH', 'origin', true], ['TH', 'national_dish']],
    names: [
      ['ผัดไทย', 'native', 'th'],
      ['phat thai', 'romanisation', 'th-Latn'],
      ['Thai fried noodles', 'synonym', 'en'],
    ],
    tags: ['stir-fried', 'street-food'],
    images: [
      {
        url: `${PLACEHOLDER}/pad-thai-plate.jpg`,
        altText: 'A plate of pad thai topped with crushed peanuts, a lime wedge on the side.',
        caption: 'Pad thai with prawns, served with lime and chilli flakes.',
        licenceCode: 'CC-BY-SA-4.0',
        attribution: 'Placeholder — no photographer credited yet',
        sourcePageUrl: `${PLACEHOLDER}/pad-thai-plate`,
      },
      {
        // Position 1, and deliberately unlicensed: this is the row the "not publishable"
        // audit query is meant to find.
        url: `${PLACEHOLDER}/pad-thai-street-cart.jpg`,
        altText: 'A street cart wok tossing noodles over a high flame at night.',
      },
    ],
  },
  {
    slug: 'sushi',
    name: 'Sushi',
    description:
      'Vinegared rice served with seafood, vegetables or egg — as slices over a formed block, '
      + 'rolled in nori, or pressed.',
    // Attaches to the `dish` root itself. Nothing in the model says an item must sit at a
    // leaf, and sushi has no useful sub-node yet.
    category: 'dish',
    countries: [['JP', 'origin', true], ['JP', 'national_dish']],
    // No `romanisation` row: "sushi" is already the canonical name, and the ADR-0004
    // trigger rejects an alias that restates it. The romanisation is not lost — it is
    // `item.name`.
    names: [
      ['寿司', 'native', 'ja'],
      ['鮨', 'native', 'ja'],
      ['すし', 'native', 'ja'],
    ],
  },
  {
    slug: 'kimchi',
    name: 'Kimchi',
    description:
      'Salted and fermented vegetables — most often napa cabbage — seasoned with chilli powder, '
      + 'garlic, ginger and jeotgal.',
    category: 'side-dish',
    countries: [['KR', 'origin', true], ['KR', 'national_dish']],
    names: [
      ['김치', 'native', 'ko'],
      ['gimchi', 'romanisation', 'ko-Latn'],
      ['kimchee', 'synonym', 'en'],
    ],
    // Eaten as itself and cooked into other things. That is a tag, not a second category.
    tags: ['fermented', 'vegetarian', 'ingredient-use'],
  },
  {
    slug: 'cevapi',
    name: 'Ćevapi',
    description:
      'Small skinless sausages of minced beef and lamb, grilled and served in somun flatbread '
      + 'with raw onion and kajmak.',
    category: 'grilled-dish',
    // Three countries on equal footing and NO primary. This is the case the optional
    // `is_primary` flag exists for — there is no honest answer to "show which one first".
    countries: [['BA', 'origin'], ['RS', 'origin'], ['HR', 'origin']],
    names: [
      ['ћевапи', 'native', 'sr-Cyrl'],
      ['ćevapčići', 'synonym', 'bs'],
      ['cevapcici', 'romanisation'],
    ],
    tags: ['grilled', 'street-food'],
  },
  {
    slug: 'pho',
    name: 'Phở',
    description:
      'A clear beef or chicken broth simmered with charred ginger and spices, poured over flat '
      + 'rice noodles and served with herbs.',
    category: 'soup',
    // Origin, national dish, and two countries it merely travelled to.
    countries: [
      ['VN', 'origin', true],
      ['VN', 'national_dish'],
      ['FR', 'popular_in'],
      ['US', 'popular_in'],
    ],
    names: [
      ['pho', 'romanisation', 'vi-Latn'],
      ['phở bò', 'synonym', 'vi'],
    ],
    tags: ['street-food'],
  },
  {
    slug: 'negroni',
    name: 'Negroni',
    description: 'Equal parts gin, sweet vermouth and Campari, stirred over ice and garnished with orange.',
    category: 'cocktail',
    // `popular_in` sitting alongside `origin` — the pattern ADR-0002 warns must never be
    // the *only* thing an item carries.
    countries: [['IT', 'origin', true], ['US', 'popular_in']],
    // Deliberately no aliases. An item may have none, and every read path has to cope.
    tags: ['alcoholic'],
    images: [
      {
        url: `${PLACEHOLDER}/negroni-glass.jpg`,
        altText: 'A negroni in a rocks glass over a large ice cube, with an orange peel.',
        licenceCode: 'CC0-1.0',
        sourcePageUrl: `${PLACEHOLDER}/negroni-glass`,
      },
    ],
  },
  {
    slug: 'gin',
    name: 'Gin',
    description: 'A neutral spirit redistilled with botanicals, of which juniper must be the predominant flavour.',
    // Dual nature, resolved ADR-0003's way: categorised as a `drink` because that is where
    // a reader looks for it, tagged `ingredient-use` for the other reading.
    category: 'spirit',
    countries: [['NL', 'origin', true], ['GB', 'popular_in']],
    names: [
      ['jenever', 'native', 'nl'],
      ['genever', 'historical', 'en'],
    ],
    tags: ['alcoholic', 'ingredient-use', 'vegan'],
  },
  {
    slug: 'eggplant',
    name: 'Eggplant',
    description:
      'The fruit of Solanum melongena, eaten as a vegetable — spongy raw, silky when roasted, fried or stewed.',
    category: 'vegetable',
    countries: [['IN', 'origin', true], ['CN', 'origin']],
    // Two synonyms that are the same kind and differ only by `lang`. This is exactly why
    // ADR-0004 puts region on the language tag rather than on a country foreign key:
    // "aubergine" is British English, not a claim that the plant is British.
    names: [
      ['aubergine', 'synonym', 'en-GB'],
      ['brinjal', 'synonym', 'en-IN'],
      ['茄子', 'native', 'ja'],
      ['nasu', 'romanisation', 'ja-Latn'],
    ],
    tags: ['vegan', 'vegetarian'],
  },
  {
    slug: 'gochujang',
    name: 'Gochujang',
    description:
      'A thick fermented paste of chilli powder, glutinous rice, meju powder and salt — savoury, sweet and hot.',
    // ingredient > condiment > fermented-paste. Three levels, so a category page has to
    // walk the tree rather than match one id.
    category: 'fermented-paste',
    countries: [['KR', 'origin', true]],
    names: [
      ['고추장', 'native', 'ko'],
      ['red chilli paste', 'synonym', 'en'],
    ],
    tags: ['fermented', 'vegan', 'ingredient-use'],
  },
  {
    slug: 'mate',
    name: 'Mate',
    description:
      'An infusion of dried yerba mate leaves, drunk hot from a shared gourd through a metal straw.',
    category: 'infusion',
    // Four co-equal origins, no primary, and two of them claim it nationally — a
    // `national_dish` role with nothing marked primary is perfectly legal.
    countries: [
      ['AR', 'origin'],
      ['PY', 'origin'],
      ['UY', 'origin'],
      ['BR', 'origin'],
      ['AR', 'national_dish'],
      ['UY', 'national_dish'],
    ],
    names: [
      ['yerba mate', 'synonym', 'es'],
      ['chimarrão', 'synonym', 'pt-BR'],
      ['ka\'ay', 'native', 'gn'],
    ],
    tags: ['caffeinated', 'vegan'],
  },
]

async function seed() {
  await db.transaction(async (tx) => {
    // `restart identity` so a re-run produces the same ids, which makes the verification
    // output diffable. `cascade` because the FKs would otherwise refuse the order.
    await tx.execute(sql`
      truncate table
        ${itemImage}, ${itemName}, ${itemTag}, ${itemCountry},
        ${item}, ${tag}, ${tagGroup}, ${category}, ${mediaLicence}, ${country}
      restart identity cascade
    `)

    await tx.insert(country).values(COUNTRIES.map(([code, name]) => ({ code, name })))
    await tx.insert(mediaLicence).values(LICENCES.map(l => ({ ...l })))

    // Categories in one pass per depth, so a parent always exists before its children.
    const categoryIds = new Map<Slug, number>()
    let remaining = Object.entries(CATEGORIES)
    while (remaining.length) {
      const ready = remaining.filter(([, [, parent]]) => parent === null || categoryIds.has(parent))
      if (!ready.length)
        throw new Error(`unreachable categories: ${remaining.map(([slug]) => slug).join(', ')}`)

      const inserted = await tx.insert(category).values(
        ready.map(([slug, [name, parent]]) => ({
          slug,
          name,
          parentId: parent === null ? null : categoryIds.get(parent)!,
        })),
      ).returning({ id: category.id, slug: category.slug })

      for (const row of inserted) categoryIds.set(row.slug, row.id)
      remaining = remaining.filter(([slug]) => !categoryIds.has(slug))
    }

    const tagIds = new Map<Slug, number>()
    for (const [groupSlug, groupName, tags] of TAG_GROUPS) {
      const [group] = await tx.insert(tagGroup)
        .values({ slug: groupSlug, name: groupName })
        .returning({ id: tagGroup.id })

      const inserted = await tx.insert(tag).values(
        tags.map(([slug, name]) => ({ slug, name, groupId: group!.id })),
      ).returning({ id: tag.id, slug: tag.slug })

      for (const row of inserted) tagIds.set(row.slug, row.id)
    }

    for (const spec of ITEMS) {
      const [row] = await tx.insert(item).values({
        slug: spec.slug,
        name: spec.name,
        description: spec.description,
        categoryId: categoryIds.get(spec.category)!,
      }).returning({ id: item.id })

      const itemId = row!.id

      await tx.insert(itemCountry).values(
        spec.countries.map(([countryCode, role, isPrimary]) => ({
          itemId,
          countryCode,
          role,
          isPrimary: isPrimary ?? false,
        })),
      )

      if (spec.names?.length) {
        await tx.insert(itemName).values(
          spec.names.map(([value, kind, lang]) => ({ itemId, value, kind, lang: lang ?? null })),
        )
      }

      if (spec.tags?.length) {
        await tx.insert(itemTag).values(spec.tags.map(slug => ({ itemId, tagId: tagIds.get(slug)! })))
      }

      if (spec.images?.length) {
        await tx.insert(itemImage).values(
          spec.images.map((image, position) => ({ itemId, position, ...image })),
        )
      }
    }
  })

  console.log(
    `seeded ${COUNTRIES.length} countries, ${LICENCES.length} licences, `
    + `${Object.keys(CATEGORIES).length} categories, ${TAG_GROUPS.length} tag groups, `
    + `${ITEMS.length} items`,
  )
}

await seed()
await pool.end()
