# Wikimedia Commons images: Licence, Attribution, and `media_licence`

**Question:** How does an Import get the Licence and Attribution for a Wikimedia Commons image, and how do Commons licences map onto vore-db's `media_licence` codes ([`backend/src/db/reference/licences.ts`](../../backend/src/db/reference/licences.ts), [ADR-0005](../adr/0005-images-are-external-references.md))? Does CC BY-SA clash with the map's permissive-content preference? Is hotlinking `upload.wikimedia.org` acceptable, and which URL form is stable?

**Date:** 2026-10-11 · ticket [#18](https://github.com/LouisLP/vore-db/issues/18), map [#16](https://github.com/LouisLP/vore-db/issues/16)

> **How claims were verified.** Anything marked "verified" was observed in live responses from `commons.wikimedia.org/w/api.php` and `upload.wikimedia.org` on 2026-10-11, using a `User-Agent` that identifies the client. Everything else cites a primary page: MediaWiki extension and API docs, Commons policy pages, Creative Commons legal code and FAQ, the SPDX licence list. Anything confirmed by neither is marked **unverified**.

---

## Verdict

- **One API call per batch of files gives everything an `item_image` row needs.** Use `action=query&prop=imageinfo&iiprop=url|extmetadata` on up to 50 `File:` titles. `LicenseShortName` → `licence_code`. `Artist` (or `Attribution` when present) → `attribution`. `descriptionurl` → `source_page_url`. A thumbnail URL → `url`. Verified on 1,623 files.
- **`LicenseShortName` is the field to map, and it is clean.** It drew only 13 distinct values across 12 Japanese-food categories, all of them `CC BY[-SA] x.y`, `CC0`, `Public domain`, or `FAL`. `License` is documented as a "best guess" that "might change", so it is a cross-check only. `AttributionRequired` agrees with the licence on every sample, but vore-db already owns that fact as `media_licence.requires_attribution`.
- **`Artist` is HTML and is sometimes missing.** It holds `<a href="//commons.wikimedia.org/wiki/User:…">` links, Flickr profile links, hidden `<span>`s, and prose like "artist not (yet) identified". It was absent on 17 of 1,623 files (1%), all of them pages with no `{{Information}}` template. The Import should strip it to text, prefer `Attribution` when set, and send any file with no usable author to human review instead of guessing.
- **The six existing codes cover 86% of the sample. Adding two rows brings that to 99%:** `CC-BY-SA-2.0` (12%, Flickr imports) and `CC-BY-3.0` (2%). The remaining tail is CC BY/BY-SA 2.5 and 1.0, FAL, and ported `… 3.0 de`-style variants. The Import should skip those files and log them. A row gets added when a wanted image needs one.
- **GFDL never needs a row.** Multi-licensed files report a single licence, and old GFDL photos carry `{{GFDL|migration=relicense}}`, which extmetadata reports as `CC BY-SA 3.0` (verified). Commons has refused GFDL-only photos since 15 Oct 2018. Commons says "you can use any of" a file's licences, so the Import records the CC one.
- **CC BY-SA does not infect vore-db.** Showing an unmodified image beside other content makes a Collection, not an Adaptation. BY-SA 3.0 §1 says so outright, and the CC FAQ says "CC licenses do not require the collection or the compilation itself to be made available under an SA license". Share-alike would apply only to an edited image (a crop or overlay) that we redistribute. Rule: **display Commons files as served and never edit them.**
- **Hotlinking is allowed but "not recommended"**, and Wikimedia now enforces standard thumbnail widths. A thumb at 800px returned **HTTP 400**, while 960px returned 200 (verified). Store a URL at a standard width (250/330/500/960/1280/1920/3840) and strip the `utm_*` query parameters the API now appends.
- **Neither file URL survives a rename. The page-id URL does.** After a Commons file is renamed, its old `upload.wikimedia.org` path returns **404** (verified on 3 renamed files), while the file page redirects. `descriptionshorturl` (`…/w/index.php?curid=<pageid>`) is the rename-proof Source page. Re-runs should refresh `url` through the API and must never rebuild it from the file name.

---

## 1. The API: `imageinfo` + `extmetadata`

### Request

```
GET https://commons.wikimedia.org/w/api.php
  ?action=query&format=json&formatversion=2
  &prop=imageinfo
  &iiprop=url|extmetadata
  &iiurlwidth=960
  &iiextmetadatafilter=LicenseShortName|License|LicenseUrl|AttributionRequired|Artist|Credit|Attribution|Copyrighted|Restrictions
  &titles=File:A.jpg|File:B.jpg|…        (≤ 50)
User-Agent: vore-db-import/0.1 (<contact email or URL>)
```

- `iiprop=url` returns `url` (the original file), `descriptionurl` (the file page) and `descriptionshorturl` (`?curid=`). With `iiurlwidth` it also returns `thumburl`. Verified in live responses. [API:Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo) notes that at most 50 scaled images come back per request, and that the thumbnail "may not match the requested width": it is the same width or larger.
- `iiprop=extmetadata` is HTML-formatted and documented as "an expensive property to request, and should be avoided unless you need it". Use `iiextmetadatafilter` to fetch only the keys above. An Import that runs on demand and batches 50 titles per call is well within reason.
- **User-Agent is mandatory in practice.** The [Wikimedia User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy) asks for `<client>/<version> (<contact>)` and says generic agents (`curl`, `Python-urllib`) "may be blocked without notice", with a 403 on a missing or empty header.

### The fields, as documented and as observed

Field semantics come from [Extension:CommonsMetadata](https://www.mediawiki.org/wiki/Extension:CommonsMetadata). It parses the machine-readable markup of the `{{Information}}` and licence templates on the file page, and falls back to EXIF/XMP/IPTC for the author.

| field | doc says | observed (verified) | use in Import |
| --- | --- | --- | --- |
| `LicenseShortName` | short human-readable licence name; "probably more reliable" than `License` | always present. Values like `CC BY-SA 4.0`, `CC0`, `Public domain`, `CC BY-SA 3.0 de`, `FAL` | **the mapping key** → `licence_code` |
| `License` | "best guess", mostly for MediaViewer, "might change" | lowercase slug: `cc-by-sa-4.0`, `cc0`, `pd`. **Absent** on FAL and on custom `{{Attribution}}` files | cross-check only |
| `LicenseUrl` | (name only) | `https://creativecommons.org/licenses/by/2.0`. Scheme and trailing slash vary (`http://…/by-sa/3.0/`) | ignore; `media_licence.url` is canonical |
| `AttributionRequired` | booleanish legal attribution flag | string `'true'`/`'false'`, consistent with licence on every sample | ignore; `media_licence.requires_attribution` owns this |
| `Copyrighted` | `True`/`False`, for PD | `'True'` even on CC0 (correctly: CC0 waives a copyright that exists) | ignore |
| `Artist` | author; "might contain complex HTML, multiple authors, etc." | HTML (see below). **Missing on 1% of files** | strip to text → `attribution` |
| `Credit` | source | `Own work` span, Flickr photo URL, archive.org URL, free prose | not the author, so never use it as the attribution |
| `Attribution` | "custom attribution that should replace Artist + Credit" | present on 46 of 1,623 files, e.g. `Ansgar Koreng / <a …>CC BY-SA 3.0 (DE)</a>` | **when present, it takes precedence over `Artist`** |
| `Restrictions` | keywords: trademarks, personality rights | `''` on every sample | flag a non-empty value for review |
| `NonFree` | true when not free; non-Commons only | never present | n/a |

**Multi-licensing caveat.** The extension's own docs say: "For multi-licensed images, these values are currently unreliable." The response reports **one** licence. On sampled `{{GFDL|migration=relicense}}` files that licence was `CC BY-SA 3.0`, the free CC option, so the caveat does not hurt in practice. The licence that was not reported is still on the file page, which is one more reason to store `source_page_url`.

### `Artist` in the wild (verified samples)

```html
<a href="//commons.wikimedia.org/wiki/User:Missvain" title="User:Missvain">Missvain</a>
<a rel="nofollow" class="external text" href="https://www.flickr.com/people/115225894@N07">Tim Reckmann</a> from Hamm, Deutschland
Unknown artist<span style="display: none;">Unknown artist</span>
artist not (yet) identified), photograph by <a href="//commons.wikimedia.org/wiki/User:Lx_121" …>User:Lx_121</a>
<a href="//…/index.php?title=User:%E3%82%A6…&action=redlink=1" class="new" …>ウィキ太郎(WikiTaro)</a>
naotakem
```

The text extractor must drop elements with `display: none`, decode entities, and collapse whitespace. It can then build `"<author text>, via Wikimedia Commons"`. Files where `Artist` is missing (seen on `File:Okonomiyaki_Kansai.jpg` and `File:Onigiri.jpg`, both pages with only a bare `{{GFDL}}` tag and the category *Media missing infobox template*) need a human. The wikitext often names the author in prose ("Photo by Suguri_F"), and no API field captures that.

### What a credit must contain

- CC BY/BY-SA 3.0 §4(c): the author's name "if supplied", the title "if supplied", and "the URI, if any, that Licensor specifies", which "may be implemented in any reasonable manner". §4(a) adds the licence URI ([legal code](https://creativecommons.org/licenses/by-sa/3.0/legalcode)).
- CC BY-SA 4.0 §3(a)(1): identification of the creator, the copyright notice, the licence notice, a URI or hyperlink to the material "to the extent reasonably practicable", and an indication of any modification. Under §3(a)(2) it is "reasonable to satisfy the conditions by providing a URI or hyperlink to a resource" that holds the details ([legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)).
- [Commons:Credit line](https://commons.wikimedia.org/wiki/Commons:Credit_line): PD media "do not require a credit line" but attribution is "encouraged". Credit "the content creator … not the uploader" ([Commons:Reusing content outside Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)).

**So ADR-0005's columns are exactly enough.** A display prints `attribution`, links it to `source_page_url`, and names `media_licence.name` linked to `media_licence.url`. That is the "reasonable manner" both licence versions describe. Nothing new is needed on `item_image`.

---

## 2. Licence distribution (verified sample)

These are all files directly in 12 Commons categories: Sushi, Ramen, Tempura, Onigiri, Okonomiyaki, Miso soup, Sake, Natto, Mochi, Udon, Soba and Takoyaki. Up to 200 files were read per category, 1,623 in total.

| `LicenseShortName` | files | share | existing code? |
| --- | ---: | ---: | --- |
| CC BY-SA 4.0 | 500 | 30.8% | ✅ `CC-BY-SA-4.0` |
| CC BY 2.0 | 282 | 17.4% | ✅ `CC-BY-2.0` |
| CC BY 4.0 | 203 | 12.5% | ✅ `CC-BY-4.0` |
| CC BY-SA 2.0 | 192 | 11.8% | ❌ |
| CC BY-SA 3.0 | 168 | 10.4% | ✅ `CC-BY-SA-3.0` |
| CC0 | 168 | 10.4% | ✅ `CC0-1.0` |
| Public domain | 70 | 4.3% | ✅ `PD` |
| CC BY 3.0 | 27 | 1.7% | ❌ |
| CC BY-SA 2.5 | 5 | 0.3% | ❌ |
| CC BY 2.5 | 4 | 0.2% | ❌ |
| CC BY-SA 1.0 | 2 | 0.1% | ❌ |
| CC BY 1.0 | 1 | <0.1% | ❌ |
| FAL | 1 | <0.1% | ❌ |

The existing six cover **1,391 / 1,623 = 85.7%**. Adding `CC-BY-SA-2.0` and `CC-BY-3.0` brings that to **1,610 / 1,623 = 99.2%**. CC BY 2.0 and CC BY-SA 2.0 are high because Commons mass-imports from Flickr, which offers exactly those two free licences. No GFDL value appears, for the reason in §3.

---

## 3. Proposed Commons → `media_licence` mapping

The mapping key is `extmetadata.LicenseShortName.value`, trimmed and matched exactly. Codes are SPDX IDs, each checked against SPDX licence list 3.29.0. All of them pass the existing `media_licence_code_format` CHECK (`^[A-Za-z0-9][A-Za-z0-9.-]*$`).

| Commons `LicenseShortName` | `media_licence.code` | status | `requires_attribution` | note |
| --- | --- | --- | --- | --- |
| `CC0` | `CC0-1.0` | existing | false | |
| `Public domain` | `PD` | existing | false | covers every `{{PD-*}}` template (`PD-old`, `PD-USGov`, `PD-self`…). See the PD caveat below |
| `CC BY 2.0` | `CC-BY-2.0` | existing | true | |
| `CC BY 4.0` | `CC-BY-4.0` | existing | true | |
| `CC BY-SA 3.0` | `CC-BY-SA-3.0` | existing | true | also what GFDL-relicensed files report |
| `CC BY-SA 4.0` | `CC-BY-SA-4.0` | existing | true | |
| `CC BY-SA 2.0` | `CC-BY-SA-2.0` | **add** | true | 12% of sample; `https://creativecommons.org/licenses/by-sa/2.0/` |
| `CC BY 3.0` | `CC-BY-3.0` | **add** | true | 2% of sample; `https://creativecommons.org/licenses/by/3.0/` |
| `CC BY 2.5` | `CC-BY-2.5` | add on demand | true | |
| `CC BY-SA 2.5` | `CC-BY-SA-2.5` | add on demand | true | |
| `CC BY 1.0` / `CC BY-SA 1.0` | `CC-BY-1.0` / `CC-BY-SA-1.0` | add on demand | true | |
| `CC BY-SA 3.0 de` (ported) | `CC-BY-SA-3.0-DE` | add on demand | true | SPDX has ported IDs, and the ported licence is a distinct legal text. Do not fold it into `CC-BY-SA-3.0` |
| `FAL` | `LAL-1.3` | add on demand | true | Free Art License 1.3; SPDX spells it `LAL` |
| GFDL (any) | (none) | **never** | | does not surface. If it ever does alone, skip the file: GFDL-only reuse requires shipping the full licence text ([Commons:Credit line](https://commons.wikimedia.org/wiki/Commons:Credit_line)) |
| `Attribution` (custom `{{Attribution}}` template) | (none) | skip / review | | seen on `File:Bunny Chow quarter loaves for filling.jpg`, which has no `License`, no `LicenseUrl` and no `AttributionRequired` |
| anything else, or missing | (none) | skip + log | | |

**Recommendation:** ship a migration adding the two **add** rows before the pilot Import. The **add on demand** rows wait until an image someone wants actually needs one, per ADR-0005's closed, hand-maintained list. The Import's lookup should be a plain `Record<string, string>` from `LicenseShortName` to code, kept beside `licences.ts`. An unmapped value is a hard skip with a log line, never a guess.

**The `PD` caveat.** `Public domain` collapses many templates with different legal bases: by age, US-government work, or the author's own release. vore-db's `PD` row already means exactly that union. An Import that wants more precision can read `License` (`pd`) or the template name from `extmetadata.Categories`, but nothing in the schema needs it. SPDX's `CC-PDM-1.0` (the Public Domain Mark) exists if a stricter code is ever wanted.

---

## 4. Does CC BY-SA conflict with "vore-db's own content stays permissive"?

**No, as long as images are displayed unmodified.**

- CC BY-SA 3.0 §1 defines a **Collection** as a work in which the licensed work "is included in its entirety in unmodified form along with one or more other contributions", and says "a work that constitutes a Collection will not be considered an Adaptation". Share-alike (§4(b)) binds only Adaptations ([legal code](https://creativecommons.org/licenses/by-sa/3.0/legalcode)).
- CC BY-SA 4.0 §3(b) applies share-alike only "if You Share Adapted Material You produce" ([legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)).
- The CC FAQ entry "If CC SA-licensed content is included in a database, does the entire database have to be licensed under an SA license?" answers: "CC licenses do not require the collection or the compilation itself to be made available under an SA license" ([CC FAQ](https://creativecommons.org/faq/)).
- vore-db stores a **URL** and a credit string, not the image. The database never contains the work itself. The licence attaches to the file on Commons, and to any page that displays it, only as an attribution duty.

**What would trigger share-alike:** cropping, overlaying, colour-grading or otherwise editing a BY-SA image and then serving the edited bytes. That would also need the 4.0 "indicate if You modified" notice. A rescaled Wikimedia thumbnail is the licensor's own rendition served by Commons, and CSS `object-fit` cropping at display time leaves the file unchanged. Whether display-time cropping counts as an adaptation is not settled by any primary source found, so it is **unverified**, but it is commonly treated as not one. The safe rule for the UI is to show the whole thumbnail.

If the reviewer still wants to avoid share-alike entirely, a filter `licence_code NOT LIKE 'CC-BY-SA-%'` would drop 53% of candidate images (867 of 1,623 in the sample). That is too high a cost for a risk the licence text rules out.

---

## 5. Hotlinking and URL stability

### Policy

- [Commons:Reusing content outside Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia): "Directly using a Commons file via embedding its URL ("hotlinking") is also possible, but is not recommended." It is permitted, with the licence obligations unchanged.
- [Common thumbnail sizes](https://www.mediawiki.org/wiki/Common_thumbnail_sizes), last edited 2026-07-28: the standard widths are **20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920 and 3840px**, and "direct requests (hotlinking) will be rejected unless they use a standard size."
- No primary source found states a rate limit for hotlinked *standard* sizes. Browser-origin requests carry the browser's User-Agent, which the User-Agent policy explicitly accepts for browser apps.

### Probes (verified, 2026-10-11)

| request | result |
| --- | --- |
| `upload.wikimedia.org/wikipedia/commons/2/28/Ramen_Jump_002.jpg` (original) | 200, `access-control-allow-origin: *` |
| `upload.wikimedia.org/…/thumb/2/28/Ramen_Jump_002.jpg/960px-Ramen_Jump_002.jpg` | 200 |
| same, `800px-` | **400** |
| `thumb.wikimedia.org/…/thumb/…/960px-…` | 200 |
| `thumb.wikimedia.org/…/thumb/…/800px-…` | **400** |
| original with a browser UA and a third-party `Referer` | 200 (no referer blocking) |
| `Special:Redirect/file/Ramen_Jump_002.jpg?width=960` | 301 → `thumb.wikimedia.org/…/960px-…?utm_source=…` |
| `Special:FilePath/Ramen_Jump_002.jpg?width=800` | 302 → `Special:Redirect` (passes the non-standard width through) |
| old name of a renamed file, at its old hashed `upload.wikimedia.org` path (×3) | **404** |
| the API with `redirects=1` on the old `File:` title | resolves to the new name and its new URL |

Two recent changes show up in the API output:

- The API now returns `thumburl` on the **`thumb.wikimedia.org`** host. Both `thumb.` and `upload.…/thumb/` serve the same path.
- `url` and `thumburl` now carry `?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=…`. These look like analytics tags, but no primary doc explaining them was found (**unverified**). The bare URL works without them.

When the original is smaller than the requested width, `thumburl` is the original file (`utm_content=thumbnail_unscaled`). Seen on `File:Okonomiyaki_Kansai.jpg`.

### What to store

| column | value | why |
| --- | --- | --- |
| `url` | `thumburl` from the API at `iiurlwidth=960`, with the query string stripped | standard width (hotlink-safe); a sensible display size; never hand-built |
| `source_page_url` | `descriptionurl` (`https://commons.wikimedia.org/wiki/File:…`) | the human-readable credit link. The file page redirects after a rename. `descriptionshorturl` (`?curid=N`) is the rename-proof alternative |
| External id (map #16) | the `File:` title, or the page id | the page id is stable across renames. A title can be re-resolved with `redirects=1` |

**Stability summary:** `upload.wikimedia.org` paths are derived from the MD5 of the current file name (`/2/28/` for `Ramen_Jump_002.jpg`). Renaming the file moves the bytes and **404s the old URL**, while the wiki page leaves a redirect. That makes `url` the least stable column in `item_image`. A re-run of the Import should re-fetch `imageinfo` through the stored page id or title, then refresh `url`. "Images whose `url` 404s" belongs in the coverage-report checks listed under "Not yet specified" on map #16. Uploading a new *version* under the same name keeps the URL but changes the bytes. ADR-0005 accepts that risk by choosing not to store hashes.

---

## Recommendations for vore-db

1. Add `CC-BY-SA-2.0` and `CC-BY-3.0` to `LICENCES` (and a migration seeding them) before the pilot Import.
2. Keep a `COMMONS_LICENCE_MAP: Record<string, string>` from `LicenseShortName` to `media_licence.code`. An unmapped value means skip and log.
3. Attribution precedence: `Attribution` → `Artist` (both stripped of HTML) → nothing, and the file goes to human review. `Credit` is never the attribution.
4. Store `thumburl@960` (query stripped) as `url` and `descriptionurl` as `source_page_url`. Keep the Commons page id with the Import's External id so re-runs can refresh `url` after renames.
5. Display images unmodified and whole. Credit line = `attribution` linked to `source_page_url` + `media_licence.name` linked to `media_licence.url`.
6. Send a descriptive `User-Agent` with contact details on every API call. Batch 50 titles per call and filter `extmetadata` keys.

---

## Sources

MediaWiki / Wikimedia documentation:
- https://www.mediawiki.org/wiki/API:Imageinfo — `iiprop`, `iiurlwidth`, `iiextmetadatafilter`, the 50-thumbnail cap, the extmetadata cost warning
- https://www.mediawiki.org/wiki/Extension:CommonsMetadata — field semantics, "best guess" `License`, multi-licence unreliability
- https://www.mediawiki.org/wiki/Common_thumbnail_sizes — standard widths, hotlink rejection of non-standard sizes
- https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy — User-Agent format and enforcement

Wikimedia Commons policy:
- https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia — hotlinking "not recommended", choosing among multiple licences, credit the creator
- https://commons.wikimedia.org/wiki/Commons:Credit_line — credit components, PD, GFDL full-text requirement
- https://commons.wikimedia.org/wiki/Commons:Licensing — accepted licences, no NC/ND, GFDL-only refused from 15 Oct 2018
- https://commons.wikimedia.org/wiki/Template:GFDL — `migration=relicense` adds CC BY-SA 3.0

Creative Commons:
- https://creativecommons.org/licenses/by-sa/3.0/legalcode — Collection vs Adaptation, §4(c) credit
- https://creativecommons.org/licenses/by-sa/4.0/legalcode.en — Adapted Material, §3(a) attribution, §3(b) share-alike scope
- https://creativecommons.org/faq/ — SA content in a database or collection

SPDX:
- https://github.com/spdx/license-list-data (`json/licenses.json`, list version 3.29.0) — ID existence for every proposed code

Live probes (2026-10-11): `commons.wikimedia.org/w/api.php` (`prop=imageinfo`, `list=search`, `generator=categorymembers`, `list=allpages&apfilterredir=redirects`), `index.php?action=raw` for wikitext, and HEAD requests against `upload.wikimedia.org` and `thumb.wikimedia.org`. Sample files are named inline above.
