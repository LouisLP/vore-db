/**
 * Regenerates `src/db/reference/countries.ts`.
 *
 *   node scripts/generate-countries.mjs
 *
 * ADR-0001 says the `country` table is seeded verbatim from the reference list and never
 * hand-edited, so the list is generated rather than typed. The codes below are the ISO
 * 3166-1 *officially assigned* alpha-2 set — 249 of them. User-assigned, exceptionally
 * reserved, transitionally reserved and withdrawn codes (EU, UK, XK, SU, YU, AN, …) are
 * deliberately absent; a vanished state is attributed to its modern successors instead.
 *
 * Names come from ICU/CLDR via `Intl.DisplayNames`, which ships with Node — no network,
 * no dependency, and no third list to keep in sync. They are what a reader expects on a
 * page ("Bolivia", not "Bolivia (Plurinational State of)"), which is what this column is
 * for. The one normalisation applied is ` & ` to ` and `.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.split(/\s+/).filter(Boolean)

const EXPECTED_COUNT = 249

if (CODES.length !== EXPECTED_COUNT || new Set(CODES).size !== EXPECTED_COUNT)
  throw new Error(`expected ${EXPECTED_COUNT} distinct codes, got ${CODES.length} (${new Set(CODES).size} distinct)`)

const displayName = new Intl.DisplayNames(['en'], { type: 'region' })

const rows = CODES.map((code) => {
  const name = displayName.of(code)
  if (!name || name === code)
    throw new Error(`ICU has no English name for ${code}`)
  return [code, name.replace(/ & /g, ' and ')]
})

const file = `/**
 * ISO 3166-1 alpha-2, officially assigned entries only — ${rows.length} rows (ADR-0001).
 *
 * GENERATED FILE — do not edit. Run \`node scripts/generate-countries.mjs\`, which
 * documents where the codes and names come from.
 */
export const COUNTRIES: ReadonlyArray<readonly [code: string, name: string]> = [
${rows.map(([code, name]) => `  ['${code}', '${name.replace(/'/g, '\\\'')}'],`).join('\n')}
]
`

const out = fileURLToPath(new URL('../src/db/reference/countries.ts', import.meta.url))
writeFileSync(out, file)
console.log(`wrote ${rows.length} countries to ${out}`)
