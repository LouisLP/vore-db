/**
 * The closed set of media licences (ADR-0005).
 *
 * Small enough to hand-maintain, unlike `countries.ts`. `requiresAttribution` is what
 * turns "which published images owe a credit they do not carry" into a query:
 *
 *   select * from item_image i join media_licence l on l.code = i.licence_code
 *   where l.requires_attribution and i.attribution is null
 *
 * Codes follow the SPDX spelling where one exists, so `CC-BY-SA-4.0` rather than
 * `CC BY-SA 4.0` — the CHECK on `media_licence.code` enforces the shape, and having one
 * spelling is the whole reason this is a table and not free text.
 */
export const LICENCES: ReadonlyArray<{
  code: string
  name: string
  url: string
  requiresAttribution: boolean
}> = [
  {
    code: 'CC0-1.0',
    name: 'CC0 1.0 Universal (public domain dedication)',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    requiresAttribution: false,
  },
  {
    code: 'CC-BY-2.0',
    name: 'Creative Commons Attribution 2.0 Generic',
    url: 'https://creativecommons.org/licenses/by/2.0/',
    requiresAttribution: true,
  },
  {
    code: 'CC-BY-SA-3.0',
    name: 'Creative Commons Attribution-ShareAlike 3.0 Unported',
    url: 'https://creativecommons.org/licenses/by-sa/3.0/',
    requiresAttribution: true,
  },
  {
    code: 'CC-BY-4.0',
    name: 'Creative Commons Attribution 4.0 International',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    requiresAttribution: true,
  },
  {
    code: 'CC-BY-SA-4.0',
    name: 'Creative Commons Attribution-ShareAlike 4.0 International',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    requiresAttribution: true,
  },
  {
    code: 'PD',
    name: 'Public domain (no rights reserved, by age or by law)',
    url: 'https://en.wikipedia.org/wiki/Public_domain',
    requiresAttribution: false,
  },
]
