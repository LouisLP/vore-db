# vore-db

A reference encyclopedia of the world's foods and drinks. One row is one canonical dish or ingredient, described so it can be browsed and filtered by where it comes from and what kind of thing it is.

## Language

**Item**:
A canonical food or drink — "pad thai", "gochujang", "negroni", "eggplant". Not a brand, not a manufactured product, not a recipe.
_Avoid_: Food, product, entry, record

**Category**:
A node in the single taxonomy that answers "what kind of thing is this". Every Item sits at exactly one; everything broader is implied by that Category's ancestors.
_Avoid_: Type, class, group, section

**Root**:
One of the three top-level Categories — Dish, Ingredient, Drink. An Item's Root is the broadest true statement about it, and the three are the encyclopedia's front doors.

**Dish**:
A prepared thing consumed as itself — pad thai, laksa, negroni. One of the three Roots.

**Ingredient**:
A thing used to make something else, catalogued in its own right — eggplant, gochujang. One of the three Roots.

**Drink**:
A thing consumed by drinking — negroni, gin. One of the three Roots, not a property of an Item.
_Avoid_: Beverage

**Tag**:
A cross-cutting fact about an Item that is not what the Item *is* — "fermented", "vegan", "street food". An Item may carry any number, including none.
_Avoid_: Label, attribute, flag, facet

**Tag group**:
A family of related Tags — diet, preparation, texture, occasion. Every Tag belongs to exactly one, so filtering can be presented family by family.

**Category versus Tag**:
A Category says what an Item *is*: required, exactly one. A Tag says what an Item is *also true of*: optional, many. A concept that could plausibly be either is a Tag — that is what keeps the taxonomy a taxonomy. An Item with genuine dual nature is categorised where a reader would look for it and tagged for the other reading: gin is a Drink, tagged `ingredient`.

**Name**:
The one canonical English display name of an Item — "eggplant", "pad thai". Every Item has exactly one, and it is what a list, card or page shows.
_Avoid_: Title, label, display name

**Alias**:
Any other name an Item goes by — the native script ("寿司"), a romanisation ("sushi"), a regional synonym ("aubergine"), a historical name. An Item may carry any number, including none. An Alias never restates the Item's Name, but two different Items may share one.
_Avoid_: Synonym (that is one kind of Alias), alternate name, translation

**Name kind**:
What sort of Alias a row is. Exactly four are recognised:

- **Native** — the name in its own script: 寿司, 김치.
- **Romanisation** — that name in Latin script: sushi, kimchi.
- **Synonym** — another name in the same language, including regional spellings: aubergine.
- **Historical** — a name the Item was formerly known by.

**Language tag**:
The language an Alias is in, written as a BCP 47 tag — `ja`, `ja-Latn`, `en-GB`. Optional: a romanisation, or a name in circulation across several languages, may have none. Region lives here rather than in Country: "aubergine" is `en-GB`, which says nothing about where the Item comes from.

**Country**:
A sovereign state or territory as listed in ISO 3166-1. The only geographic unit in the model.
_Avoid_: Nation, region, place, locale

**Origin**:
The association between an Item and a Country it comes from. Every Item has at least one.
_Avoid_: Source, provenance, from

**Origin role**:
What an Item's association with a Country means. Exactly three are recognised:

- **Origin** — the Item comes from there. Every Item has at least one of these.
- **National dish** — the Item is held up as emblematic of that Country.
- **Popular in** — the Item is widely eaten or drunk there without coming from there.

**Primary country**:
The single Country shown first when an Item is displayed. Optional — an Item shared between Countries on equal footing, like ćevapi or hummus, has none.
_Avoid_: Main country, home country, default country

## Deliberately absent

**Cuisine** and **culinary region** are not modelled. "Cantonese" is expressed as China; "Levantine" as Lebanon, Syria and Jordan together. If a culinary axis is ever needed it will be a new concept, not a widening of Country.

**Historical states** are not modelled. An Item from a vanished state is attributed to the modern Countries that succeeded it.

**Facet categories** are not modelled. A cross-cutting fact like "fermented" or "vegan" is a Tag, never a Category, and the taxonomy has no `diet` or `preparation` Root. The two mechanisms are kept apart so the question "is this a Category or a facet" does not have to be re-answered per Item.

**A translated encyclopedia** is not modelled. vore-db records the world's names as data — that is what Aliases are — but the encyclopedia itself is written in English. Descriptions and the names of Categories, Tags and Tag groups are single English columns with no translation tables and no locale resolution. A localised interface would be a new effort, not a widening of Alias.

**Scientific names** are not Aliases. *Solanum melongena* is a fact about a species, not something people call the food, so it belongs with an Item's other attributes rather than in its names.

**Universal ingredients** — water, salt, plain sugar — are not Items. An Item that cannot be associated with any Country does not belong in this encyclopedia.
