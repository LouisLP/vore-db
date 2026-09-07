/**
 * Proves the seeded schema does what the model says it does.
 *
 *   pnpm db:verify
 *
 * Every section both prints its result and asserts it, so this is a smoke test as well as
 * a demonstration: it exits non-zero the moment the schema stops behaving. Run it after
 * `pnpm db:migrate && pnpm db:seed`.
 *
 * Reads are raw SQL rather than the query builder on purpose — what is being verified is
 * the *database*, and a recursive CTE or a deferred-trigger rejection has no query-builder
 * form anyway.
 */
import { sql } from 'drizzle-orm'
import { db, pool } from './client.ts'

let failures = 0

function section(title: string) {
  console.log(`\n\x1B[1m${title}\x1B[0m`)
}

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? '\x1B[32m✓\x1B[0m' : '\x1B[31m✗\x1B[0m'} ${label}${detail ? ` — ${detail}` : ''}`)
}

async function rows<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute<T>(query)
  return result.rows as T[]
}

/**
 * Runs `body` in a transaction that is always rolled back, and returns the message the
 * database raised — or `null` if it accepted the write.
 *
 * `set constraints all immediate` before the rollback is load-bearing: ADR-0002's trigger
 * is DEFERRABLE INITIALLY DEFERRED, so it fires at COMMIT and a plain rollback would never
 * reach it. Forcing the deferred checks makes the rule observable without committing
 * anything, which is why the seed is still intact at the end of this script.
 */
async function expectRejection(body: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await body(tx)
      await tx.execute(sql`set constraints all immediate`)
      throw new Error('__no_rejection__')
    })
    return null
  }
  catch (error) {
    if (error instanceof Error && error.message === '__no_rejection__') return null
    // Drizzle wraps the driver error; the readable text is on the cause.
    const cause = error instanceof Error ? error.cause : undefined
    const message = cause instanceof Error ? cause.message : error instanceof Error ? error.message : String(error)
    return message
  }
}

// ---------------------------------------------------------------------------
section('Browse by country — every item South Korea is associated with, and how')
// ---------------------------------------------------------------------------
{
  const byCountry = await rows<{ slug: string, name: string, role: string, is_primary: boolean }>(sql`
    select i.slug, i.name, ic.role, ic.is_primary
    from item i
    join item_country ic on ic.item_id = i.id
    where ic.country_code = 'KR'
    order by ic.role, i.name
  `)
  for (const r of byCountry)
    console.log(`    ${r.name.padEnd(12)} ${r.role}${r.is_primary ? ' (primary)' : ''}`)

  check('kimchi and gochujang both originate in KR',
    byCountry.filter(r => r.role === 'origin').map(r => r.slug).sort().join(',') === 'gochujang,kimchi')
  check('kimchi is also KR\'s national dish',
    byCountry.some(r => r.slug === 'kimchi' && r.role === 'national_dish'),
    'one country, two roles, two rows')

  const primaryFirst = await rows<{ slug: string, primary_country: string | null }>(sql`
    select i.slug,
           (select c.name
            from item_country ic join country c on c.code = ic.country_code
            where ic.item_id = i.id and ic.is_primary) as primary_country
    from item i
    order by i.slug
  `)
  const noPrimary = primaryFirst.filter(r => r.primary_country === null).map(r => r.slug).sort()
  console.log(`    items with no primary country: ${noPrimary.join(', ')}`)
  check('ćevapi and mate have no primary country', noPrimary.join(',') === 'cevapi,mate',
    'co-equal origins, nothing to lead with')
}

// ---------------------------------------------------------------------------
section('Filter by category — the whole `drink` subtree, via one recursive CTE')
// ---------------------------------------------------------------------------
{
  const subtree = await rows<{ slug: string, name: string, category: string, depth: number }>(sql`
    with recursive descendants as (
      select id, slug, name, 0 as depth from category where slug = 'drink'
      union all
      select c.id, c.slug, c.name, d.depth + 1
      from category c join descendants d on c.parent_id = d.id
    )
    select i.slug, i.name, d.name as category, d.depth
    from item i join descendants d on d.id = i.category_id
    order by i.name
  `)
  for (const r of subtree)
    console.log(`    ${r.name.padEnd(12)} ${r.category} (${r.depth} below drink)`)

  check('drink subtree holds gin, mate and negroni',
    subtree.map(r => r.slug).sort().join(',') === 'gin,mate,negroni',
    'drink-ness is a place in the tree, not a column')

  const deep = await rows<{ path: string }>(sql`
    with recursive up as (
      select c.id, c.parent_id, c.name, c.name as path
      from category c join item i on i.category_id = c.id
      where i.slug = 'gochujang'
      union all
      select p.id, p.parent_id, p.name, p.name || ' > ' || u.path
      from category p join up u on u.parent_id = p.id
    )
    select path from up where parent_id is null
  `)
  console.log(`    gochujang sits at: ${deep[0]?.path}`)
  check('gochujang is three levels deep',
    deep[0]?.path === 'Ingredient > Condiment > Fermented paste')

  const atRoot = await rows<{ slug: string }>(sql`
    select i.slug from item i join category c on c.id = i.category_id
    where c.parent_id is null
  `)
  check('sushi attaches directly to a root category',
    atRoot.map(r => r.slug).join(',') === 'sushi', 'items need not sit at a leaf')
}

// ---------------------------------------------------------------------------
section('Resolve an alias to an item — case-insensitive, across kinds and scripts')
// ---------------------------------------------------------------------------
{
  for (const needle of ['AUBERGINE', '김치', 'phat thai', 'genever', 'Ćevapčići']) {
    const hits = await rows<{ slug: string, name: string, kind: string, lang: string | null }>(sql`
      select i.slug, i.name, n.kind, n.lang
      from item_name n join item i on i.id = n.item_id
      where lower(n.value) = lower(${needle})
    `)
    const hit = hits[0]
    console.log(`    "${needle}" -> ${hit ? `${hit.name} (${hit.kind}${hit.lang ? `, ${hit.lang}` : ''})` : 'no match'}`)
    check(`"${needle}" resolves`, hits.length === 1)
  }

  const regional = await rows<{ value: string, lang: string | null }>(sql`
    select n.value, n.lang from item_name n join item i on i.id = n.item_id
    where i.slug = 'eggplant' and n.kind = 'synonym' order by n.lang
  `)
  check('eggplant\'s regional synonyms differ only by lang',
    regional.map(r => `${r.value}/${r.lang}`).join(' ') === 'aubergine/en-GB brinjal/en-IN')

  const canonical = await rows<{ slug: string }>(sql`
    select slug from item where lower(name) = 'sushi'
  `)
  check('"sushi" is found on item.name, not as an alias',
    canonical.length === 1 && canonical[0]?.slug === 'sushi')
}

// ---------------------------------------------------------------------------
section('ADR-0002 — the deferred trigger rejects an item with no `origin` country')
// ---------------------------------------------------------------------------
{
  const noCountries = await expectRejection(async (tx) => {
    await tx.execute(sql`
      insert into item (slug, name, category_id)
      values ('tap-water', 'Tap water', (select id from category where slug = 'drink'))
    `)
  })
  check('an item with no countries at all is rejected at COMMIT',
    noCountries !== null, noCountries?.split('\n')[0])

  const onlyPopularIn = await expectRejection(async (tx) => {
    await tx.execute(sql`
      with new_item as (
        insert into item (slug, name, category_id)
        values ('pizza', 'Pizza', (select id from category where slug = 'dish'))
        returning id
      )
      insert into item_country (item_id, country_code, role)
      select id, 'US', 'popular_in' from new_item
    `)
  })
  check('an item carrying only `popular_in` is rejected — it still owes its origin row',
    onlyPopularIn !== null, onlyPopularIn?.split('\n')[0])

  const removedOrigin = await expectRejection(async (tx) => {
    await tx.execute(sql`
      delete from item_country
      where item_id = (select id from item where slug = 'negroni') and role = 'origin'
    `)
  })
  check('deleting an existing item\'s last origin row is rejected too',
    removedOrigin !== null, removedOrigin?.split('\n')[0])

  const acceptedInOneTx = await expectRejection(async (tx) => {
    await tx.execute(sql`
      with new_item as (
        insert into item (slug, name, category_id)
        values ('laksa', 'Laksa', (select id from category where slug = 'soup'))
        returning id
      )
      insert into item_country (item_id, country_code, role, is_primary)
      select id, 'MY', 'origin', true from new_item
    `)
  })
  check('an item and its origin inserted in one transaction is accepted',
    acceptedInOneTx === null, 'which is what DEFERRABLE INITIALLY DEFERRED buys')
}

// ---------------------------------------------------------------------------
section('ADR-0004 — an alias never restates its item\'s own name')
// ---------------------------------------------------------------------------
{
  const aliasRestates = await expectRejection(async (tx) => {
    await tx.execute(sql`
      insert into item_name (item_id, value, kind, lang)
      values ((select id from item where slug = 'sushi'), 'Sushi', 'romanisation', 'ja-Latn')
    `)
  })
  check('adding "Sushi" as an alias of Sushi is rejected',
    aliasRestates !== null, aliasRestates?.split('\n')[0])

  const renameCollides = await expectRejection(async (tx) => {
    await tx.execute(sql`update item set name = 'Aubergine' where slug = 'eggplant'`)
  })
  check('renaming Eggplant to "Aubergine", already one of its aliases, is rejected',
    renameCollides !== null, renameCollides?.split('\n')[0])

  const duplicateAlias = await expectRejection(async (tx) => {
    await tx.execute(sql`
      insert into item_name (item_id, value, kind)
      values ((select id from item where slug = 'eggplant'), 'AUBERGINE', 'synonym')
    `)
  })
  check('the same alias twice on one item is rejected, case-insensitively',
    duplicateAlias !== null, duplicateAlias?.split('\n')[0])

  const sharedAcrossItems = await expectRejection(async (tx) => {
    await tx.execute(sql`
      insert into item_name (item_id, value, kind)
      values ((select id from item where slug = 'negroni'), 'gin', 'synonym')
    `)
  })
  check('the same string as an alias of two different items is allowed',
    sharedAcrossItems === null, 'names are not globally unique — `slug` is the handle')
}

// ---------------------------------------------------------------------------
section('Remaining invariants')
// ---------------------------------------------------------------------------
{
  const twoPrimaries = await expectRejection(async (tx) => {
    await tx.execute(sql`
      insert into item_country (item_id, country_code, role, is_primary)
      values ((select id from item where slug = 'negroni'), 'FR', 'origin', true)
    `)
  })
  check('a second primary country on one item is rejected', twoPrimaries !== null)

  const popularPrimary = await expectRejection(async (tx) => {
    await tx.execute(sql`
      insert into item_country (item_id, country_code, role, is_primary)
      values ((select id from item where slug = 'cevapi'), 'DE', 'popular_in', true)
    `)
  })
  check('a `popular_in` country cannot be the primary one', popularPrimary !== null)

  const badSlug = await expectRejection(async (tx) => {
    await tx.execute(sql`
      insert into item (slug, name, category_id)
      values ('Pad Thai!', 'x', (select id from category where slug = 'dish'))
    `)
  })
  check('a non-slug slug is rejected', badSlug !== null)

  const badLang = await expectRejection(async (tx) => {
    await tx.execute(sql`
      insert into item_name (item_id, value, kind, lang)
      values ((select id from item where slug = 'gin'), 'ginebra', 'synonym', 'Spanish')
    `)
  })
  check('a `lang` that is not a BCP 47 tag is rejected', badLang !== null)

  const outsideIso = await expectRejection(async (tx) => {
    await tx.execute(sql`
      insert into item_country (item_id, country_code, role)
      values ((select id from item where slug = 'cevapi'), 'YU', 'origin')
    `)
  })
  check('a country outside ISO 3166-1 is rejected', outsideIso !== null,
    'Yugoslavia is Bosnia, Serbia and Croatia — three rows, which is what ćevapi carries')

  const updatedAt = await rows<{ moved: boolean }>(sql`
    with before as (select updated_at from item where slug = 'gin'),
         bump as (update item set description = description where slug = 'gin' returning updated_at)
    select (select updated_at from bump) > (select updated_at from before) as moved
  `)
  check('`updated_at` is moved by the trigger, not by the writer', updatedAt[0]?.moved === true)

  const primaryImage = await rows<{ slug: string, url: string }>(sql`
    select distinct on (i.id) i.slug, im.url
    from item i join item_image im on im.item_id = i.id
    order by i.id, im.position
  `)
  check('the primary image is the lowest position, with no flag to disagree',
    primaryImage.some(r => r.slug === 'pad-thai' && r.url.endsWith('pad-thai-plate.jpg')))

  const unpublishable = await rows<{ slug: string, url: string, why: string }>(sql`
    select i.slug, im.url,
           case when im.licence_code is null then 'no licence'
                else 'licence requires attribution, none given' end as why
    from item_image im
    join item i on i.id = im.item_id
    left join media_licence l on l.code = im.licence_code
    where im.licence_code is null or (l.requires_attribution and im.attribution is null)
    order by i.slug
  `)
  for (const r of unpublishable) console.log(`    ${r.slug}: ${r.why}`)
  check('the "not publishable" audit is a query, not a per-image judgement',
    unpublishable.length === 1 && unpublishable[0]?.slug === 'pad-thai')

  const counts = await rows<{ table_name: string, n: string }>(sql`
    select 'country' as table_name, count(*)::text as n from country
    union all select 'category', count(*)::text from category
    union all select 'tag', count(*)::text from tag
    union all select 'item', count(*)::text from item
    union all select 'item_country', count(*)::text from item_country
    union all select 'item_name', count(*)::text from item_name
    union all select 'item_tag', count(*)::text from item_tag
    union all select 'item_image', count(*)::text from item_image
    order by table_name
  `)
  console.log(`    ${counts.map(c => `${c.table_name}=${c.n}`).join('  ')}`)
  check('the seed is intact — every rejection above rolled back',
    counts.find(c => c.table_name === 'item')?.n === '10')
}

console.log(failures ? `\n\x1B[31m${failures} check(s) failed\x1B[0m` : '\n\x1B[32mall checks passed\x1B[0m')
await pool.end()
process.exit(failures ? 1 : 0)
