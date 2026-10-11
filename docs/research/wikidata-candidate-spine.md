# Wikidata as the candidate spine for Imports

**Question:** Can Wikidata supply the candidate list for an Import (the Items, each with its External id), together with enough Origin, Alias and Image signal to make drafting cheap? Where is it noisy, where is it thin, and what's the cheapest way to pull ~5k Items? ([#17](https://github.com/LouisLP/vore-db/issues/17), part of map [#16](https://github.com/LouisLP/vore-db/issues/16))

**Date:** 2026-10-11

**What was measured against:** the live Wikidata Query Service (WDQS) at `https://query.wikidata.org/sparql`, queried on 2026-10-11. Every number below comes from a query I ran that day. The data is edited continuously, so expect the counts to drift by a few percent. Licence and service limits are cited to their first-party pages.

> **How claims were verified.** "Measured" means a SPARQL query was run against WDQS and the count is what came back. The queries are reproduced inline, so anyone can re-run them. Spot-checks name the QID so they can be re-checked. Anything I couldn't confirm is marked **unverified**.

---

## Verdict

**Yes, Wikidata works as the spine, as long as three things are understood: it is classes rather than instances, the noise has to be filtered, and Origin recall is only about half.**

- **Dishes, drinks and ingredients are modelled as *classes*, not instances.** Sushi ([Q46383](https://www.wikidata.org/wiki/Q46383)) is `P279` *subclass of* "Japanese rice dish", and `P31` *instance of* "type of food or dish" ([Q19861951](https://www.wikidata.org/wiki/Q19861951)), which is a metaclass. Enumerating `?x wdt:P31 wd:Q746549` (instance of dish) misses most real Items. The spine has to walk `wdt:P279+` from the roots, with `P31/P279*` added in for the minority that are modelled as instances.
- **The `P31` side of the food tree is mostly products, not Items.** Of 45,845 instances under food ([Q2095](https://www.wikidata.org/wiki/Q2095)), the largest buckets are individual beers (3,993), wines (2,972), NEIPAs and other beer styles (several thousand), "beer brand" (1,425) and Bordeaux "First Growth" estates (1,078). Those are exactly what `CONTEXT.md` says is *not* an Item: brands and manufactured products.
- **P495 (country of origin) is precise but has about 50% recall on dishes, and less on drinks and ingredients.** Adding `P2012` *cuisine* → `P17` *country* recovers famous gaps: tempura, ramen and nori carry Japanese cuisine but lack or misstate P495. P495 maps cleanly onto ISO 3166-1 alpha-2 (`P297`) about 90% of the time. The other 10% are non-sovereign or historical values (England, Korea, Netherlands, Soviet Union, Levant), and those need a small hand-kept mapping table.
- **Ingredients are the weak Root.** Many raw ingredients (wasabi, yuzu, the eggplant species) exist mainly as **taxon** items, which have no P495 and sit outside the food tree. An Ingredient's Origin will usually be LLM-drafted with human sign-off, not corroborated by Wikidata.
- **Native-script names are excellent and romanisations are absent.** 97% of Japanese candidates have a `ja` label, and 46% have `ja` aliases. There are **zero** `ja-latn` labels and **zero** uses of `P2125` (revised Hepburn romanization) across the Japanese food set. Romanisation Aliases must be derived (from the `en` label when it *is* a romanisation, otherwise drafted), not imported.
- **P18 image coverage is high among notable Items:** 50 of the 50 pilot candidates, 96% of Japanese candidates with ≥5 sitelinks, and 57% of the full long tail. **The images are not CC0.** P18 is a Commons filename, and each file carries its own licence (the sushi image is CC BY-SA 2.0 with attribution required). Licence, Attribution and Source page come from the Commons `imageinfo`/`extmetadata` API, one call per batch of files.
- **Licence: structured data is CC0, with no attribution obligation.** Commons media and Wikipedia text are *not* covered by that statement.
- **Pull mechanism for ~5k Items: SPARQL to enumerate QIDs per Country, then `wbgetentities` (50 ids per call) or batched SPARQL `VALUES` for the fields.** A full dump (~130 GiB compressed JSON) is far too large for this. Recursive class-tree queries hit the hard 60 s WDQS timeout easily, so enumeration has to be scoped by Country.

**Bottom line for #16:** use Wikidata as the source of candidates and External ids (`P279+` under dish/drink/food ingredient, scoped per Country by `P495 ∪ P2012→P17`, with an explicit noise-class blocklist, ranked by sitelinks), and as the source of `ja`-style Native Aliases and P18 image pointers. Don't treat it as the authority on Origin for Ingredients, on romanisations, or on image licences.

---

## 1. Which classes enumerate Items, and how much noise they carry

### Roots and tree sizes (measured)

| Root (Wikidata) | QID | direct `P31` instances | `P279+` subclasses |
| --- | --- | ---: | ---: |
| food | [Q2095](https://www.wikidata.org/wiki/Q2095) | 2,207 | **31,782** |
| dish | [Q746549](https://www.wikidata.org/wiki/Q746549) | 3,727 | **13,247** |
| drink | [Q40050](https://www.wikidata.org/wiki/Q40050) | 822 | **5,483** |
| food ingredient | [Q25403900](https://www.wikidata.org/wiki/Q25403900) | 807 | **7,189** |
| type of food or dish (metaclass) | [Q19861951](https://www.wikidata.org/wiki/Q19861951) | 1,139 | n/a |
| alcoholic beverage | [Q154](https://www.wikidata.org/wiki/Q154) | 199 | (inside drink) |
| ingredient | [Q10675206](https://www.wikidata.org/wiki/Q10675206) | 85 | n/a |

```sparql
SELECT ?root (COUNT(DISTINCT ?i) AS ?n) WHERE {
  VALUES ?root { wd:Q746549 wd:Q40050 wd:Q25403900 wd:Q2095 }
  ?i wdt:P279+ ?root .
} GROUP BY ?root            # 39.8 s — close to the 60 s ceiling
```

The three vore-db Roots line up well with dish / drink / food ingredient, and the Wikidata superclass at each candidate is a usable *hint* for the Category. It is not a mapping, though: sushi's parents are "Japanese rice dish", "seafood dish" and "raw fish dish" (three parents, where vore-db wants exactly one Category).

### How Items are modelled (spot-checked)

Well-known Japanese Items are almost all `P279` classes. Of the 1,432 Japanese candidates (enumerated in §5), **81% have a `P279` parent**, and only 44% have any `P31` at all. Where they have a `P31`, it is usually the metaclass Q19861951 or a parent dish class used loosely. Recommendation: enumerate with `(wdt:P31|wdt:P279)/wdt:P279*` and treat "is a class" as the norm.

### Noise in the instance side (measured)

Top `P31` classes among the 45,845 instances under food:

| class | instances | Item by `CONTEXT.md`? |
| --- | ---: | --- |
| beer (Q44) | 3,993 | no: individual products |
| dish (Q746549) | 3,727 | mostly yes |
| wine (Q282) | 2,972 | no: individual wines |
| baked good (Q2251745) | 1,663 | mixed |
| Imperial stout, NEIPA, double NEIPA, American IPA, DIPA | ~1,000–1,570 each | no: individual beers |
| beer brand (Q15075508) | 1,425 | no: brand |
| First Growth (Q10750129) | 1,078 | no: wine estates |
| meat product (Q1427887) | 849 | mixed |
| alcohol brand (Q80359036) | 214 | no: brand |

### Noise in the Japanese set (measured, by `P31`)

Among the 1,432 Japanese candidates, the non-Item buckets are: cultivar (67, mostly rice varieties), product (37), trademark (28), brand (28), food brand (27), Regional Collective Trademark (8), local brand in Japan (7), sake rice (7), drink brand (7), coffee brand (4), beer brand (4), food preparation technique (6), and cuisine (3). Blocking those classes leaves **1,217**.

The blocklist doesn't catch everything. Residual noise in the pilot top 50 (§7):

- **Not food at all:** koi ([Q378846](https://www.wikidata.org/wiki/Q378846)), an ornamental carp that ends up in the tree via a "food fish" path.
- **Category-shaped, not Item-shaped:** wagashi, donburi, tsukemono, nabemono. These are families of Items, and look more like vore-db Categories or Tags.
- **Meal formats or techniques:** bento, teppanyaki, osechi.
- **Products surviving the filter in the long tail:** candy products such as ひもQ ([Q110664671](https://www.wikidata.org/wiki/Q110664671)) and かむかむ.

Expect roughly 15% of a filtered, sitelink-ranked list to need a human "not an Item" call. That's fine with one reviewer working in batches, but the batch file should be able to mark a candidate *rejected* so a re-run doesn't propose it again.

---

## 2. P495 country of origin: coverage and ISO mapping

### Coverage per root (measured over `P279+` subclasses)

| Root | n | has P495 | P495 → `P297` (ISO alpha-2) | has P18 |
| --- | ---: | ---: | ---: | ---: |
| dish | 13,247 | 6,738 (51%) | 6,088 (46%) | 8,141 (61%) |
| drink | 5,483 | 1,521 (28%) | 1,372 (25%) | 2,203 (40%) |
| food ingredient | 7,189 | 2,474 (34%) | 2,312 (32%) | 3,586 (50%) |

```sparql
SELECT ?root (COUNT(DISTINCT ?i) AS ?n) (COUNT(DISTINCT ?a) AS ?p495)
       (COUNT(DISTINCT ?b) AS ?p495iso) (COUNT(DISTINCT ?d) AS ?img) WHERE {
  VALUES ?root { wd:Q746549 wd:Q40050 wd:Q25403900 }
  ?i wdt:P279+ ?root .
  OPTIONAL { ?i wdt:P495 [] . BIND(?i AS ?a) }
  OPTIONAL { ?i wdt:P495/wdt:P297 [] . BIND(?i AS ?b) }
  OPTIONAL { ?i wdt:P18 [] . BIND(?i AS ?d) }
} GROUP BY ?root            # 18.2 s
```

### P2012 cuisine as a second Origin signal (measured)

`P2012` (*cuisine*) links a dish to a cuisine item. The cuisine item carries `P17` *country*: for example Japanese cuisine ([Q234138](https://www.wikidata.org/wiki/Q234138)) → Japan.

- 256 items have `P2012 = Japanese cuisine`. Only **58** of them also have `P495 = Japan`, so cuisine adds about 190 Japanese candidates, and 8 of those carry a *different* P495.
- Across all dishes, `P495 ∪ P2012→P17` resolving to an ISO code covers **6,426 / 13,247 (49%)**, up from 46%.

`CONTEXT.md` doesn't model Cuisine. That's fine: `P2012→P17` is used only as evidence for a Country, which ADR-0001 allows, and the cuisine itself is never stored.

### Does P495 map onto ISO 3166-1 alpha-2?

Mostly, through `P495/P297`. The P495 values in the food tree that have **no** `P297` (measured, top of list):

| P495 value | items | what to do |
| --- | ---: | --- |
| Korea (Q18097) | 217 | ambiguous between KR and KP; human or LLM call |
| Netherlands (Q55) | 160 | ISO code sits on Kingdom of the Netherlands (Q29999); map → `NL` |
| England (Q21), Scotland (Q22), Wales (Q25) | 97 / 66 / 13 | map → `GB` |
| China (Q29520, the cultural/civilisation item) | 63 | map → `CN` |
| Soviet Union, Russian Empire, Ottoman Empire, UK of GB & Ireland, Czechoslovakia, Kievan Rus' | 35 / 24 / 12 / 10 / 7 / 5 | historical states: per `CONTEXT.md`, attribute to modern successors (human call) |
| Levant, Middle East, Maghreb, Central Asia, Eastern Europe, Europe, Scandinavia, Indian subcontinent, Mesoamerica | 5–20 each | regions: expand to Countries or reject (human call) |
| Ryukyu Kingdom (Q28025) | 10 | map → `JP` (relevant to the Japan pilot: awamori) |
| Tibet, Kurdistan, Bavaria, Bohemia, Ossetia | 5–19 | sub-national or disputed; human call |

So a ~20-row `wikidata_qid → iso2` override table, plus "anything else without `P297` goes to review", covers it.

### Japanese spot-check (measured, 36 well-known Items)

- **P495 = JP and correct:** sushi, sashimi, miso, miso soup, udon, soba, okonomiyaki, takoyaki, dashi, nattō, yakitori, sukiyaki, shabu-shabu, tonkatsu, karaage, gyūdon, oden, onigiri, umeboshi, dango, dorayaki, taiyaki, edamame, ponzu, Japanese curry, sake, shōchū, teriyaki.
- **Missing P495** (would be lost by a P495-only spine): tempura ([Q328709](https://www.wikidata.org/wiki/Q328709)), mochi ([Q470519](https://www.wikidata.org/wiki/Q470519)), matcha (two competing items, [Q822331](https://www.wikidata.org/wiki/Q822331) and [Q85209885](https://www.wikidata.org/wiki/Q85209885)), nori ([Q201565](https://www.wikidata.org/wiki/Q201565)), wasabi the spice ([Q12378304](https://www.wikidata.org/wiki/Q12378304)), Japanese gyoza ([Q107014807](https://www.wikidata.org/wiki/Q107014807)). Tempura and nori are recovered by `P2012`.
- **Arguably wrong:** ramen ([Q234646](https://www.wikidata.org/wiki/Q234646)) has `P495 = China` only, with `P2012 = Japanese cuisine`. For vore-db it is an Origin JP item with a Chinese antecedent. This is exactly the case the map's "LLM-asserted origin needs corroboration or human sign-off" rule exists for.
- **Spurious extra origins:** katsuobushi `JP CN`, rousong `JP CN` (rousong is Chinese and only incidentally Japanese).
- **Multi-country P495 is rare:** 13 of 1,432 (1%).
- **Outside the Japanese set entirely, for comparison:** gochujang ([Q699637](https://www.wikidata.org/wiki/Q699637)) has **no** P495, which is surprising for the canonical Korean ingredient.

**Takeaway:** P495 is a good corroborating signal and a poor exhaustive one. Use `P495 ∪ P2012→P17` to generate candidates, and treat their *agreement* as the "structured-source corroboration" that map #16 requires before an Origin is accepted.

---

## 3. Native-script labels and romanisations as Aliases

Measured over the 1,432 Japanese candidates:

| field | coverage | usable as |
| --- | ---: | --- |
| `rdfs:label @ja` | 1,393 (97%) | **Native** Alias, Language tag `ja` |
| `skos:altLabel @ja` (one or more) | 658 (46%) | Native or Synonym Alias, `ja` (needs a human to tell which) |
| `rdfs:label @en` | 1,063 (74%) | candidate Name (not an Alias) |
| `P1705` native label (monolingual text) | 185 (13%) | Native Alias. Its language tags are mostly `ja`, plus `ja-hani` (9), `ja-hira` (2), `ja-kana` (2), `ryu` (3, Okinawan) |
| `P1814` name in kana | 76 (5%) | Native Alias, `ja-Hrkt` (kana reading) |
| `rdfs:label @ja-latn` | **0** | n/a |
| `P2125` revised Hepburn romanization | **0** | n/a |

Wikidata's language codes are BCP 47-shaped but lowercase (`ja-hani`, `nan-latn-pehoeji`). Normalise the case on the way in: `ja-Hani`, `nan-Latn-pehoeji`. Labels in `mul` (33 in this set) have no single language; per `CONTEXT.md` they become Aliases with no Language tag.

**Romanisations aren't in Wikidata as tagged data.** The `en` label is often a Hepburn romanisation (`udon`, `gyūdon`, `nattō`, `shōchū`), but it's sometimes an English translation instead (`red bean paste` for 小豆餡, `Japanese curry`). It is untagged either way. Options for the pilot: draft the `ja-Latn` Romanisation with the LLM from the `ja` label, using the `en` label as a hint, and mark it drafted.

---

## 4. P18 image coverage

| set | has P18 |
| --- | ---: |
| pilot top 50 (§7) | 50 / 50 |
| Japanese candidates after noise filter, with `en` label and ≥5 sitelinks | 310 / 323 (96%) |
| Japanese candidates after noise filter, with `en` label | 677 / 905 (75%) |
| all 1,432 Japanese candidates | 816 (57%) |
| all dish subclasses | 8,141 / 13,247 (61%) |

P18 values are Commons `Special:FilePath` URLs. **The image licence is per-file and not CC0.** Verified for sushi's P18 through the Commons API:

```
GET https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo
    &iiprop=url|extmetadata
    &iiextmetadatafilter=LicenseShortName|License|Artist|AttributionRequired|LicenseUrl
    &titles=File:Various sushi, beautiful October night at midnight.jpg
→ License: cc-by-sa-2.0   LicenseShortName: CC BY-SA 2.0   AttributionRequired: true
  Artist: <a href="https://www.flickr.com/people/26226522@N08">Yumi Kimura</a>   (HTML)
  url: https://upload.wikimedia.org/wikipedia/commons/7/7a/Various_sushi%2C_…jpg?utm_source=…
  descriptionurl: https://commons.wikimedia.org/wiki/File:Various_sushi,_beautiful_October_night_at_midnight.jpg
```

This maps directly onto ADR-0005: `License` → `licence_code` (needs normalising onto the `media_licence` table), `Artist` → `attribution` (strip the HTML), `url` → `url` (strip the `utm_*` query string), and `descriptionurl` → `source_page_url`. `titles=` accepts multiple files joined with `|`, so batching is possible. Not measured here: the per-call file limit (the standard MediaWiki multi-value limit of 50 is assumed, **unverified** for this module) and the share of P18 files that are CC BY-SA versus CC BY/CC0/PD.

---

## 5. Query-service limits, and dump vs. API for a ~5k pull

### WDQS limits (first-party: [WDQS User Manual](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual), "Query limits")

- **Hard 60 s query deadline**, "both for the Web interface and the public SPARQL endpoint".
- "One client (user agent + IP) is allowed **60 seconds of processing time each 60 seconds**."
- "One client is allowed **30 error queries per minute**."
- "access to the service is limited to **5 parallel queries per IP**."
- Over the limit you get HTTP **429**: "Use `Retry-After` header to see when the request can be repeated". Persisting after a 429 can get you temporarily banned.
- A descriptive **User-Agent** is required, and clients that don't send one may be blocked.
- No result-size limit is documented.

What this looked like in practice (measured):

| query | time | outcome |
| --- | ---: | --- |
| `P279+` counts for 4 roots | 39.8 s | ok |
| group food *instances* by class, with label service | 65.2 s | **504 timeout** |
| same, without label service | 18.1 s | ok |
| Japanese candidates: `P495 = Q17` + food tree | 15.6 s | ok, 1,432 rows |
| same, joined with labels/P18/P31 in one query | 38.8 s | **502** |
| enrich 250 QIDs via `VALUES` (labels, aliases, P31/P279/P495/P297/P18/P1705/P1814, sitelinks) | 0.7–2.3 s | ok |
| pilot top-50 query (§7) | 38.3 s | ok, but near the ceiling |

**Pattern that works:** (1) a narrow enumeration query per Country that returns only QIDs, then (2) enrichment in `VALUES` batches of about 250. Joining everything in one go is what times out.

### Dump vs. API

- **JSON dump** ([Wikidata:Database download](https://www.wikidata.org/wiki/Wikidata:Database_download)): "The dumps are being created on a weekly basis". The page's own example `wikidata-20240101-all.json.gz` is **130.53 GiB**. Truthy NTriples and the third-party WDumper (custom filtered dumps) also exist. For 5k Items this is wildly oversized, and you'd still need to compute the class tree yourself.
- **Action API `wbgetentities`** ([API help](https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities)): "Maximum number of values is **50** (500 for clients that are allowed higher limits)". It returns full entity JSON (labels, aliases, claims, sitelinks). For 5k Items that is about 100 requests.
- **Recommendation:** WDQS for enumeration (per Country, QIDs only) → `wbgetentities` in 50s for the canonical entity JSON. Check the raw JSON into the Import's batch directory so the draft is reproducible → Commons `imageinfo` for P18 licences. A full ~5k pull is a few hundred HTTP calls, minutes not hours. The SPARQL `VALUES` enrichment used in this research works too, and is simpler if only truthy values are needed.

---

## 6. Licence

- [Wikidata:Copyright](https://www.wikidata.org/wiki/Wikidata:Copyright): "All structured data from the main, Property, Lexeme, and EntitySchema namespaces" is available under **CC0**. Text in other namespaces is CC BY-SA, and "additional terms may apply".
- [CC0 1.0 deed](https://creativecommons.org/publicdomain/zero/1.0/): "You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission." Attribution isn't required. The only behavioural ask is "you should not imply endorsement". It also notes "In no way are the patent or trademark rights of any person affected by CC0", which doesn't matter for Item names.
- Neither Wikidata page states an attribution obligation for CC0 data. **Confirmed: CC0, no attribution obligation**, for labels, aliases, statements and QIDs.
- **Not covered by CC0:** Commons images (per-file licence, §4) and Wikipedia text (CC BY-SA, already ruled out by #16). Item *descriptions* on Wikidata are structured data and therefore CC0, but #16 says to write descriptions fresh anyway.

---

## 7. Sample query: ~50 Japanese pilot candidates

Run on 2026-10-11: **50 rows in 38.3 s.** Paste it into <https://query.wikidata.org/>.

```sparql
# vore-db pilot: ~50 Japanese candidate Items from Wikidata.
# Candidate = subclass (or instance) of food (Q2095) with country of origin (P495) Japan (Q17),
# minus brands, products, trademarks and cultivars; ranked by sitelink count as a notability proxy.
SELECT ?item ?en ?ja (GROUP_CONCAT(DISTINCT ?iso; separator=" ") AS ?origins) (SAMPLE(?image) AS ?p18) ?sitelinks WHERE {
  ?item wdt:P495 wd:Q17 .
  ?item (wdt:P31|wdt:P279)/wdt:P279* wd:Q2095 .
  FILTER NOT EXISTS {
    VALUES ?noise { wd:Q431289 wd:Q16323605 wd:Q167270 wd:Q2424752 wd:Q4886 wd:Q11424232 wd:Q11424201
                    wd:Q114392939 wd:Q15075508 wd:Q111651093 wd:Q80359036 wd:Q951964 wd:Q1039303 wd:Q1778821 }
    ?item wdt:P31 ?noise .
  }
  ?item wikibase:sitelinks ?sitelinks .
  ?item rdfs:label ?en FILTER(LANG(?en) = "en")
  OPTIONAL { ?item rdfs:label ?ja FILTER(LANG(?ja) = "ja") }
  OPTIONAL { ?item wdt:P495/wdt:P297 ?iso }
  OPTIONAL { ?item wdt:P18 ?image }
}
GROUP BY ?item ?en ?ja ?sitelinks
ORDER BY DESC(?sitelinks)
LIMIT 50
```

The noise classes are brand, food brand, trademark, product, cultivar, Regional Collective Trademark, local brand in Japan, drink brand, beer brand, coffee brand, alcohol brand, food product, food preparation technique, and cuisine.

Result (all 50 have `ja` and P18; flags are my reading against `CONTEXT.md`):

| # | QID | en | ja | origins | sitelinks | flag |
| ---: | --- | --- | --- | --- | ---: | --- |
| 1 | Q46383 | sushi | 寿司 | JP | 133 | |
| 2 | Q170219 | sake | 日本酒 | JP | 84 | |
| 3 | Q190715 | sashimi | 刺身 | JP | 60 | |
| 4 | Q235169 | miso | 味噌 | JP | 53 | |
| 5 | Q471866 | miso soup | 味噌汁 | JP | 53 | |
| 6 | Q471861 | udon | うどん | JP | 52 | |
| 7 | Q13393 | onigiri | おにぎり | JP | 52 | |
| 8 | Q378846 | koi | 錦鯉 | JP | 49 | **not food** |
| 9 | Q701075 | okonomiyaki | お好み焼き | JP | 49 | |
| 10 | Q380532 | bento | 弁当 | JP | 48 | meal format |
| 11 | Q1051265 | instant noodles | インスタント麺 | JP | 45 | product type; judgement call |
| 12 | Q905527 | takoyaki | たこ焼き | JP | 44 | |
| 13 | Q851746 | dashi | 出汁 | JP | 43 | |
| 14 | Q505711 | nattō | 納豆 | JP | 42 | |
| 15 | Q753910 | soba | 蕎麦 | JP | 42 | |
| 16 | Q1045910 | mirin | みりん | JP | 41 | |
| 17 | Q483163 | yakitori | 焼き鳥 | JP | 40 | |
| 18 | Q877913 | dango | 団子 | JP | 40 | |
| 19 | Q862569 | sukiyaki | すき焼き | JP | 39 | |
| 20 | Q815740 | surimi | 魚肉練り製品 | JP | 39 | |
| 21 | Q1142841 | tonkatsu | 豚カツ | JP | 38 | |
| 22 | Q1140464 | red bean paste | 小豆餡 | JP | 37 | |
| 23 | Q1051482 | dorayaki | どら焼き | JP | 36 | |
| 24 | Q1061856 | shabu-shabu | しゃぶしゃぶ | JP | 35 | |
| 25 | Q181195 | taiyaki | たい焼き | JP | 35 | |
| 26 | Q1063096 | wagashi | 和菓子 | JP | 34 | Category-shaped |
| 27 | Q1067842 | daifuku | 大福 | JP | 34 | |
| 28 | Q1165352 | shōchū | 焼酎 | JP | 34 | |
| 29 | Q1045417 | umeboshi | 梅干し | JP | 34 | |
| 30 | Q655040 | oden | おでん | JP | 33 | |
| 31 | Q701870 | Japanese curry | 日本のカレー | JP | 33 | |
| 32 | Q568347 | anpan | あんパン | JP | 32 | |
| 33 | Q24890727 | raindrop cake | 水信玄餅 | JP | 32 | |
| 34 | Q427226 | omurice | オムライス | JP | 31 | |
| 35 | Q1061842 | donburi | 丼物 | JP | 30 | Category-shaped |
| 36 | Q1334390 | sencha | 煎茶 | JP | 30 | |
| 37 | Q431640 | teppanyaki | 鉄板焼き | JP | 30 | technique |
| 38 | Q1144102 | Yakisoba | 焼きそば | JP | 29 | |
| 39 | Q1377879 | edamame | 枝豆 | JP | 29 | |
| 40 | Q113739 | katsuobushi | 鰹節 | JP CN | 29 | CN origin dubious |
| 41 | Q559408 | Yōkan | 羊羹 | JP | 29 | |
| 42 | Q747302 | tamagoyaki | 卵焼き | JP | 29 | |
| 43 | Q862557 | osechi | 御節料理 | JP | 29 | meal format |
| 44 | Q7480691 | tsukemono | 日本の漬物 | JP | 29 | Category-shaped |
| 45 | Q1069948 | awamori | 泡盛 | JP | 28 | P495 also Ryukyu Kingdom |
| 46 | Q87590 | castella | カステラ | JP | 28 | |
| 47 | Q166204 | kamaboko | 蒲鉾 | JP | 28 | |
| 48 | Q1919688 | melonpan | メロンパン | JP | 28 | |
| 49 | Q2899201 | rousong | ロウソン | JP CN | 28 | **really CN** |
| 50 | Q519365 | genmaicha | 玄米茶 | JP | 28 | |

About 41 of the 50 are clean Items. Notably missing because they lack P495 = JP: **ramen, tempura, mochi, matcha, wasabi**. For the real pilot, union in `?item wdt:P2012 wd:Q234138` (Japanese cuisine), which recovers ramen and tempura, and hand-add the rest.

---

## Open questions this doesn't answer

- **Category mapping:** how a Wikidata superclass set (for example sushi → rice dish + seafood dish + raw fish dish) becomes one vore-db Category. This belongs to the LLM-drafting ticket.
- **Dedup:** Wikidata has duplicate or competing items (two matcha items; jiaozi [Q640769](https://www.wikidata.org/wiki/Q640769) vs. Japanese gyoza [Q107014807](https://www.wikidata.org/wiki/Q107014807)). This feeds the "Dedup and merge" item on #16.
- **Image licence distribution** across P18 files (what share needs Attribution), and the exact batch limit of Commons `imageinfo`. **Unverified.**
- **Taxon-backed Ingredients:** whether an Ingredient's External id should point at the culinary item or the taxon (wasabi: [Q12378304](https://www.wikidata.org/wiki/Q12378304) spice vs. [Q49855](https://www.wikidata.org/wiki/Q49855) *Eutrema japonicum*).
