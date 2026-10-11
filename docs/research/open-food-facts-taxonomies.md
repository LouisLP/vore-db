# Open Food Facts taxonomies: useful to vore-db's Imports, or drop them?

**Question:** Is anything in Open Food Facts' (OFF) taxonomies (categories, ingredients, origins) useful to vore-db's Imports, or should it be dropped as a source? In particular: what the taxonomies contain and how they are published, whether their licence fits the map's preference for CC0-only structured facts, and whether OFF adds anything Wikidata lacks for **Ingredients**.

**Date:** 2026-10-11

**Snapshot these findings describe:**

| file | path in `openfoodfacts/openfoodfacts-server` | last commit touching it |
| --- | --- | --- |
| ingredients | `taxonomies/food/ingredients.txt` (3.07 MB) | `4d5cf55` (2026-10-11) |
| categories | `taxonomies/food/categories.txt` (3.64 MB) | `d44d1fa` (2026-10-09) |
| origins | `taxonomies/origins.txt` (186 KB) | `main` on 2026-10-11 |

> **How claims were verified.** The three files were downloaded from `main` and parsed with a throwaway script (an entry is a blank-line-separated block that carries at least one `<lang>: name` line and is not a pure `synonyms:`/`stopwords:` block). All counts below come from that parse. Licence claims are quoted from OFF's own terms page and the ODbL 1.0 text. Anything I could not confirm is marked **unverified**.

---

## Verdict

**Drop it as an Import source.** Use Wikidata directly; OFF's taxonomies contribute nothing vore-db needs that outweighs the licence problem.

1. **The licence is not CC0, whichever way you read it.** OFF never states a licence for the taxonomy files specifically: its [terms of use](https://world.openfoodfacts.org/terms-of-use) and [data page](https://world.openfoodfacts.org/data) cover only "the Open Food Facts database" (ODbL), its "individual contents" (DbCL) and images (CC BY-SA). The files live in a repo whose licence is **AGPL-3.0** (GitHub licence API on `openfoodfacts-server`). So the taxonomies are either part of the ODbL database or AGPL-licensed repo content. Both carry share-alike, so either one rules them out under the map's preference.
2. **ODbL's share-alike would bite.** Copying "the whole or a Substantial part of the Contents into a new database" creates a Derivative Database (§4.4b), and any Derivative Database that is publicly used "must be only under the terms of" the ODbL (§4.4). "Substantial" means "in terms of quantity or quality", and "repeated and systematic Extraction… of insubstantial parts" can add up to a substantial part (§1.0) ([ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)). A seeding Import that systematically pulls names, hierarchy or translations from OFF is exactly that. OFF's terms add: "Derivative works must be shared under the same conditions."
3. **The DbCL loophole is too thin to build on.** Individual entries are DbCL (a public-domain-like waiver for single facts), but the value of a taxonomy is its arrangement (the parent edges, which synonym sets go together), and arrangement is what ODbL protects. An Import that copies one fact by hand is fine. A pipeline is not.
4. **For Ingredients, Wikidata already holds the useful part.** OFF's multilingual names for food concepts largely restate Wikidata labels, and OFF itself links to Wikidata for only **22%** of ingredient entries. What OFF adds beyond Wikidata is product-label parsing machinery: plurals, processing variants, additives, and nutrition and environmental database codes. None of it fits vore-db's Item model.
5. **The one tempting signal (PDO/PGI origins) has a better upstream.** About 4,200 categories carry `origins:en:` country links, mostly from EU protected-name registrations. Those registrations come from the EU's own registry, not from OFF, so take them from the EU registry if they are ever wanted (licence **unverified**, outside this ticket's scope).

---

## 1. What the taxonomies contain

### Format

Plain-text DAG files edited by pull request. A block is one entry: `< en: parent` lines (zero or more parents), then `lang: name, synonym, synonym` lines, then `property:lang: value` lines. `xx:` is a language-neutral name. Blank lines separate entries. A JSON export of the same data is served at `https://static.openfoodfacts.org/data/taxonomies/ingredients.json` (verified: HTTP 200, 3.66 MB, keyed by `en:<id>`, no licence field in the payload).

### Counts (parsed)

| taxonomy | entries | with `wikidata:en:` | roots (no parent) | with an `en:` name | languages seen |
| --- | --- | --- | --- | --- | --- |
| ingredients | 5,730 | 1,273 (**22%**) | 274 | 4,846 | 192 |
| categories | 14,725 | 4,229 (**29%**) | 65 | 9,286 | 182 |
| origins | 457 | 113 (25%) | 25 | 355 | 149 |

So Wikidata links exist (`wikidata:en: Q141898` style, one QID per entry), but they cover a minority of entries. The categories file opens with a "Wikidata mappings" section and a SPARQL query for finding candidates, so the gap is a known backlog rather than a design choice.

### What the properties are for

Most common non-name properties, by entry count:

- **ingredients:** `ciqual_food_name`/`code` (French nutrition DB, 1,643), `description` (1,377), `wikidata` (1,273), `wikipedia` (1,006), `usda_fdc_code`/`usda_ndb_*` (~690), a family of `ecobalyse_*` environmental-impact keys (~200–260 each), `vegan`/`vegetarian` (~230), `eurocode_2_group_*`, `carbon_footprint_*`. The file header documents allergens and NOVA processing markers too.
- **categories:** `ciqual_food_*` (5,213), `origins` (4,247), `wikidata` (4,233), `protected_name_type` (3,453: 2,230 PDO, 994 PGI, 189 GI, 38 TSG), `agribalyse_*`, GS1 `gpc_category_*`, `google_product_taxonomy_id`, `pnns_group_2`, `sales_format`, `wco_hs_code`.
- **origins:** `wikipedia`, `iso`, `wikidata`, `insee`, `nuts`, `osm_relation`. Its header says it automatically includes the countries taxonomy and was, as of 2020, "a test taxonomy" for sub-country granularity.

The properties show what the taxonomies are for. They exist to **parse ingredient lists printed on packaged products** and to join products to nutrition (CIQUAL, USDA), environmental (Agribalyse, Ecobalyse) and retail (GS1, Google) classifications. Neither job is vore-db's.

### Shape mismatch with vore-db's model

Sampled entries against the CONTEXT.md glossary:

- **`kimchi` (ingredients)** has parent `white cabbage`, which is right for parsing a label and wrong for a Category tree where kimchi is a fermented Ingredient or Dish in its own right. The same concept also appears separately in **categories** as `Kimchi < Fermented vegetables`. OFF has two disconnected trees for one Item.
- **`aubergine, eggplant` (ingredients)** has parent `fruit vegetable`, about 100 translations, and a commented-out (`#`) description. Its siblings include `raw aubergine` and `grilled aubergines`: 415 ingredient entries are `raw …`/`cooked`/`dried`/`frozen`/`powder`/`concentrate` variants. These are product states, not Items.
- **`Pad thai` (categories)** has parent `Meals`, an `xx:`/`ja:` name and `wikidata:en: Q730298`. Its neighbours are `Frozen grain based meals` and `Meal replacements, meal substitutes`. The category tree is shelved by retail aisle (frozen, ready meals, sauces), not by "what kind of thing is this" in ADR-0003's sense.
- `gochujang` does not appear in either file (grep: 0 hits).
- Category entry names are plural shelf labels ("Fermented vegetables", "American beers") and the facet-like axes ADR-0003 deliberately keeps out of the Category tree (country-of-beer, frozen, organic) are mixed into the hierarchy.

---

## 2. Licence

| layer | licence | source |
| --- | --- | --- |
| OFF database | ODbL 1.0 | [terms of use](https://world.openfoodfacts.org/terms-of-use), [data](https://world.openfoodfacts.org/data), [API licence tutorial](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/) |
| individual contents | DbCL 1.0 | same pages |
| product images | CC BY-SA | same pages |
| taxonomy `.txt` files | **not stated**; the repo is AGPL-3.0 | GitHub licence API on `openfoodfacts/openfoodfacts-server`. None of the three pages above mentions taxonomies (checked). |

What the ODbL requires, from the [licence text](https://opendatacommons.org/licenses/odbl/1-0/):

- **Derivative Database** (§1.0) includes any "translation, adaptation, arrangement, modification" of the Database or a substantial part of its Contents.
- **§4.4 Share-alike:** a publicly used Derivative Database must be under ODbL (or a compatible licence). §4.4(b): extracting a substantial part into a new database makes that new database a Derivative Database. §4.4(c): publicly using a Produced Work made from a Derivative Database counts as publicly using the Derivative Database.
- **§4.5 limits:** a *Collective Database* (OFF unmodified alongside independent databases) need not be ODbL. A Produced Work alone does not create a Derivative Database. Internal-only use is not public.
- **§4.3:** a publicly used Produced Work needs an attribution notice.

Against vore-db: an Import that seeds Categories, Aliases or hierarchy from OFF writes OFF contents into vore-db's own tables. That is an extraction into a new database, not a Collective Database, and vore-db is public. So vore-db's content would have to be ODbL, which breaks the CC0-only preference. If the files count as AGPL instead, the result is the same: copyleft, not CC0.

Wikidata, by contrast, publishes its structured data under CC0 ([Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)), which is why the map already leans on it.

**One trap even when reading OFF only for inspiration:** some OFF ingredient `description:en:` lines are English text lifted from Wikipedia ("Eggplant (Solanum melongena) is a plant species in the nightshade family…"), which is CC BY-SA. Copying descriptions would import a third licence.

---

## 3. Does OFF add anything Wikidata lacks for Ingredients?

| OFF offers | useful to vore-db? | why |
| --- | --- | --- |
| Multilingual names (up to ~190 languages) | No; Wikidata has them | Wikidata labels and aliases cover the same concepts under CC0. Where OFF has a QID, the translations are typically mirrored from or into Wikidata. |
| Label-parsing synonyms (plurals, spellings, `synonyms:` word lists like `colour, color`) | No | These are tokeniser aids, not Aliases in vore-db's sense (Native / Romanisation / Synonym / Historical). |
| Processing variants (`raw aubergine`, `dried …`, `… powder`) | No | Product states, not Items. |
| Additives, E-numbers, flavourings, fungicides (`Imazalil`) | No | Not foods in vore-db's sense. |
| CIQUAL / USDA / Agribalyse / Ecobalyse codes | Not now | Nutrition and environmental impact are not in vore-db's model. If they were wanted, the owning databases are the primary source. |
| `vegan:` / `vegetarian:` flags | Marginal | ~230 entries; this is a Tag fact vore-db will author anyway. |
| Ingredient → parent edges (`kimchi < white cabbage`) | No | They encode "made mostly of", not ADR-0003's "what kind of thing is this". |
| QID mapping table | Weak | Only 22% coverage, and vore-db can resolve QIDs directly against Wikidata. Even a mapping table, extracted systematically, is a substantial part under ODbL. |

The one thing OFF has that Wikidata is patchy on is **breadth of everyday packaged-food vocabulary in many languages**, for example region-specific product words. That is valuable for parsing labels, and labels are not vore-db's problem.

---

## 4. If vore-db ever revisits

- **Treat OFF as a reviewer's lookup, not an Import.** A human can check an OFF entry while authoring an Item, which is fine as an insubstantial, non-systematic use. No pipeline, no bulk mapping.
- **PDO/PGI and Origins:** if protected designations ever become a Tag or an Origin signal, go to the EU's own registry (eAmbrosia), which is where OFF's `protected_name_type`/`origins` data ultimately comes from (inferred from the `protected_name_file_number` property; **unverified**, and that registry's reuse licence was not checked here).
- **Nutrition codes:** if nutrition enters scope, link to CIQUAL/USDA directly, not via OFF.
