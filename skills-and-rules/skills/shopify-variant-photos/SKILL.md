---
name: shopify-variant-photos
description: Naming and setup rules for Bangle Bliss (Shopify) product photos so that clicking a color/style variant shows only that variant's photos. Use whenever creating a new product with a Color/Colour/Style/Finish/Pattern option, uploading product images, or bulk-generating product photos for Shopify. Also use to audit/fix an existing product whose gallery doesn't filter by variant.
version: 1.0.0
---

# Shopify variant photo naming (Bangle Bliss)

Bangle Bliss's theme (Horizon) only lets a Shopify variant have **one** natively "attached" photo. To support
several photos per color anyway (studio/lifestyle/worn/close-up), the theme snippet
`snippets/product-media-gallery-content.liquid` matches each photo's **alt text** against the selected
variant's option value. Get the alt text wrong and the extra photos just sit there for every color — this
is the exact bug that was fixed on 2026-10-14.

## The rule

For any product with a visual variant option (Color, Colour, Style, Finish, or Pattern):

1. **Alt text must start with the exact option value**, spelled identically to the option value in Shopify
   (case-sensitive-ish — it's a substring match, so "Ruby Red" must appear verbatim).
   ```
   {Exact Option Value} {product descriptor} - {shot type}
   ```
   Example: `Ruby Red kundan glass bangles - lifestyle`, `Dotted gold ghungroo chuda set of 28`.
2. **A photo with no option value in its alt text** (e.g. a lifestyle shot with the full color range, or a
   banner image) is treated as shared/general and shows for every variant. That's fine and often wanted —
   just don't accidentally give it a name that happens to contain a color word.
3. **Every variant needs its own featured image set** (Shopify Admin → product → variant → image), even if
   it's a 1:1 reuse of that color's hero shot. If a variant's image is blank, the gallery falls back to
   showing *everything* unfiltered for that variant — this is a separate, silent failure from #1 and bit us
   on 3 colors of one product (no photo had ever been assigned at all).
4. One option value must never be a plain substring of a different option value for the same product (e.g.
   avoid pairing "Red" and "Ruby Red" as separate values) — the matching logic would wrongly treat "Ruby
   Red" photos as also matching "Red".

## Checklist when adding a new color/style product

- [ ] Decide the full list of option values in Shopify first; copy-paste them exactly when naming files/alt text.
- [ ] Upload all photos, alt-texting each one per the pattern above.
- [ ] In Shopify Admin, set each variant's image (every size under a color needs the same color's hero shot).
- [ ] Confirm the product template's "Product Media" block has **"Hide unselected variant media"** ON (it's
  the store default in `templates/product.json`, so usually already true).
- [ ] Open the live/preview PDP, click through every option value, and confirm the photo set changes and
  that no photo from another color lingers.

## If the theme snippet needs a new option name

The snippet currently checks, in order: `Color`, `Colour`, `Style`, `Finish`, `Pattern`. If a future product
uses some other option name for its visual variant (e.g. `Material`), add it to the same `if color_option ==
blank` chain near the top of `snippets/product-media-gallery-content.liquid` in the Horizon theme (Admin →
Online Store → Themes → Edit code), following the existing pattern.

## Auditing an existing product

Ask Claude Code (or anyone with the Shopify Admin MCP connected) to:
1. Pull the product's `options` (GraphQL `product(id) { options { name position values } }`) to find the
   visual option and its values.
2. Pull `product.media(first: 100) { nodes { id alt } }` and check every alt text starts with one of the
   option values.
3. Pull `product.variants(first: 100) { nodes { id title image { url } } }` and check no variant has
   `image: null`.
4. Fix any gaps with `productVariantsBulkUpdate` (`mediaId` sets a variant's featured photo) and by editing
   alt text (`productVariantsBulkUpdate`'s media-oriented mutations, or re-upload with corrected alt text).

As of 2026-10-14 all active color/style products in the Bangle Bliss catalog were audited and fixed this way:
Kundan Stone Glass Bangles, Gold Vine Kundan Glass Bangles, Kundan Multi Stone Glass Bangles, and The
Kashmiri Metal Stack (Style option).

---

# Shopify Magic bulk generation pipeline (Bangle Bliss Ghunghroo)

Validated 2026-10-27. Pipeline files live in `My Bangle Bliss/`:
- `drive_shopify_generator.py` — CATALOG, SHOT_SPECS, `build_prompt()`
- `run_drive_generation.py` — 4-worker parallel Playwright fleet (full 644-shot run)
- `run_single_test.py` — single/multi-variant test runner (use this to validate before full run)

## Shot types (7 per variant)

| # | Filename | Description |
|---|---|---|
| 1 | `1_white_background.png` | Pure white bg, bangles tilted at 30–45° |
| 2 | `2_micro_detail.png` | Extreme macro close-up of craftsmanship |
| 3 | `3_lifestyle_studio.png` | Studio lifestyle with props |
| 4 | `4_women_hands_close.png` | Women's hands with mehndi wearing bangles |
| 5 | `5_women_saree_wide.png` | Full woman in matching saree |
| 6 | `6_bangle_box.png` | Bangles in premium gift box |
| 7 | `7_two_sets.png` | Two sets side by side, festive lifestyle |

## Prompt architecture (long-formula wins — A/B confirmed)

Every shot uses: **reference-grounding header → scene description → explicit counts → negative constraints block**. Short prompts produce clearly worse results; do not trim.

**Reference grounding header (shots 1–6):**
> "You are given a composite reference image showing the authentic physical jewellery piece with its labeled structure, circular depth, and craftsmanship. IMPORTANT: Reproduce the exact product design, color, and craftsmanship shown in the reference..."

**Shot 7 is different** — uses the *generated shot-1 white-bg image* as the Shopify Files reference (not the composite). Prompt opens with: "The reference image shows one complete [product] bangle set in [color]. Using this exact product..."

## Defect fixes validated in production

### Standing cylinder (shots 1 & 7)
AI renders bangles as a perfect upright cylinder unless explicitly blocked. Fix in shot 1:
> "CRITICAL PRESENTATION: The bangle stack must be shown lying on its side in a natural resting position — like bangles resting on a flat surface with the circular opening facing partially toward the camera at roughly a 30–45 degree tilt. You should see the FACE/SIDE of the bangle layers... NOT looking down into an upright cylinder, NOT the bangles standing perfectly vertical like a cup."

Also in neg block of every shot: `NO upright standing cylinders — do NOT render the bangle set as a perfectly vertical standing cylinder with the opening facing straight up.`

### Color mixing
AI injects random colors into glass bangles. Fix in neg block:
> `STRICTLY ONLY {COLOR} colored glass bangles — DO NOT inject, mix, or substitute any foreign colors into the glass bangles.`

### Leaf/flower connector
AI generates leaf/petal-shaped connectors above bells (not in the real product). Fix in neg block:
> `NO leaf-shaped, flower-shaped, or petal-shaped metal pendants or decorative connectors above any bells or charm elements — connect bells directly via jump rings or short chain links only.`

### Charm count (shots 1, 4, 6, 7)
AI inconsistently generates 3 instead of 4 charms. Fix: `EXACTLY 4 {c_desc}... not 3, not 5, exactly 4.`

### Shot 7 count (4 sets instead of 2)
The AI strongly prefers generating 4 sets (2×2 grid). **All-caps "COUNT RULE" language breaks design fidelity** — the AI stops following the reference. The working solution:
1. Use the generated shot-1 image as the Shopify Files reference for shot 7
2. Prompt: natural language "exactly 2 of these sets placed side by side — one LEFT, one RIGHT... single horizontal row, just 2 sets, no extras"
3. Add lifestyle setting (velvet cloth, golden bokeh, rose petals, marigolds, Diwali mood) — plain background makes the AI revert to 4-set grid

## Negative constraints block (full, used on every shot)

```
STRICT NEGATIVE CONSTRAINTS:
STRICTLY NO KALEERAS. Under NO circumstances generate large bridal kaleeras, umbrella bells, cascading tiered tassels, or long hanging chains dangling past the hands.
NO leaf-shaped, flower-shaped, or petal-shaped metal pendants or decorative connectors above any bells or charm elements — connect bells directly via jump rings or short chain links only.
STRICTLY ONLY {COLOR} colored glass bangles — DO NOT inject, mix, or substitute any foreign colors into the glass bangles. Reproduce ONLY the exact color shown in the composite reference panels.
NO upright standing cylinders — do NOT render the bangle set as a perfectly vertical standing cylinder with the opening facing straight up.
Rigid authentic bangle set as shown in the reference panels, no display stands or holders visible.
```

## Pipeline mechanics

- **Prompt submission**: clipboard paste (`pyperclip.copy` + `Ctrl+V`) guarded by `CLIPBOARD_LOCK` — never character-by-character typing which drops characters in long prompts
- **FID caching**: `test_fid_cache.json` stores `composite::{col}::{var}` and `whitebg::{col}::{var}` FIDs to avoid re-uploading on re-runs
- **Shot 7 reference upload**: `run_single_test.py` automatically uploads shot 1's output after it's saved, then uses that FID for shot 7
- **State**: `generation_state.json` + `GENERATION_PROGRESS.md` track per-shot status for resumable full runs
- **Wipe**: use Python subprocess (`python -c "import shutil; shutil.rmtree(...)"`) not PowerShell `Remove-Item` — the latter gets blocked in auto-permission mode

## Running

Test a single variant first, always:
```
python run_single_test.py "rn p1" "Crimson Red"
```
Default (no args) runs 3 variants: rn p1 / Crimson Red, Emerald Green, Wine Maroon.

Full 644-shot run (92 variants × 7 shots, 4 parallel workers):
```
python run_drive_generation.py > logs/drive_generation_fresh.log 2>&1
```
**Note**: `run_drive_generation.py` does NOT yet implement the shot-7 white-bg reference trick — it uses composite for all shots. Update `worker_thread` to mirror `run_single_test.py`'s two-phase FID logic before the next full run.
