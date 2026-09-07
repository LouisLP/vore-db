# vore-db

A reference encyclopedia of the world's foods and drinks. One row is one canonical dish or ingredient, described so it can be browsed and filtered by where it comes from and what kind of thing it is.

## Language

**Item**:
A canonical food or drink — "pad thai", "gochujang", "negroni", "eggplant". Not a brand, not a manufactured product, not a recipe.
_Avoid_: Food, product, entry, record

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

**Universal ingredients** — water, salt, plain sugar — are not Items. An Item that cannot be associated with any Country does not belong in this encyclopedia.
