# Horizon (Shopify 2025+ theme) build notes

Learned building Bangle Bliss's festive theme (Oct 2026). Reference implementation:
`My Bangle Bliss/theme-festive/` (files prefixed `bb-`).

## Workflow
- `shopify theme pull --store <shop>.myshopify.com --theme <id> --path <new-folder>`; the CLI is already
  logged in on this machine. Never edit the MAIN theme; push to a new one:
  `shopify theme push --unpublished --theme "<Name> (preview)"`, then `--theme <id>` for updates and
  `--only <file>` for one-file pushes.
- Preview: `https://<domain>/?preview_theme_id=<id>`. The in-app browser pane crops screenshots at mobile
  sizes; use headless Playwright (`viewport 390x844, is_mobile=True`) with `full_page=True`, and for desktop
  screenshot sections by locator (`[id$="<section_key>"]`). Use `wait_until='load'` + a short wait;
  `networkidle` times out on Shopify storefronts.
- `shopify theme check --output json` and filter to your files; stock Horizon already carries ~7 warnings.
- Templates (`templates/*.json`, `sections/*-group.json`, `config/settings_data.json`) start with a
  `/* ... */` comment: strip it before `json.loads`, write it back unchanged. Use `ensure_ascii=False`.

## Hooks that already exist (use before writing code)
- Second image on hover: theme setting `show_second_image_on_hover` (default true).
- Card hover effect: `card_hover_effect` (none/lift/scale); a custom CSS layer gives finer control.
- Mobile quick add: `mobile_quick_add`.
- Sale badge text: `blocks/_product-card-gallery.liquid` renders `content.product_badge_sale`; swap that
  one line for `{% render 'bb-discount-badge', product: product %}` to show "50% OFF".
- Product page accepts `@theme` blocks inside `_product-details`, so a file in `blocks/` with a preset
  can be inserted into `templates/product.json` → `main.blocks.product-details.block_order`.
- Sections: a file in `sections/` with `presets` shows in the editor; add it to `templates/index.json`
  `sections` + `order`. Disable rather than delete old ones (`"disabled": true`).
- Global CSS: one `{{ 'bb-x.css' | asset_url | stylesheet_tag }}` before `</head>` in `layout/theme.liquid`;
  global snippets (popup, WhatsApp) render near the end of `<body>`.
- Per-section CSS goes in `{% stylesheet %}` (bundled once by Shopify). Inline JS in a section can find its
  root with `document.currentScript.previousElementSibling`.

## Patterns that worked
- Countdown: store the target as `YYYY-MM-DDTHH:MM:SS+05:30`, tick in JS; hide the section server-side
  after an end date (`'now' | date: '%s'` vs setting) so an expired offer never shows.
- Discount badge: loop variants, deepest `(compare_at - price) * 100 / compare_at`.
- Prices in Liquid are paise: round to rupees with `| divided_by: 100 | times: 100` before `money`.
- Newsletter capture: `{% form 'customer' %}` + hidden `contact[tags]`; on reload
  `form.posted_successfully?` is true, so reveal the code there. Remember dismissals in localStorage
  (try/catch), skip in `Shopify.designMode`.
- `<dialog>` + `showModal()` gives focus trapping and Esc for free; bottom sheet on mobile.
- Instagram: the theme section takes a "Live feed URL" (Cloudflare Worker holding the token, see
  `My Bangle Bliss/instagram-proxy/`) and falls back to blocks, then to collection photos.
- Collection images fall back to `c.products.first.featured_image`; check that the first product photo
  is a studio shot, or set an explicit image on the block.

## Store-data gotchas
- Smart-collection rules on tags are exact matches: `glass` ≠ `glass bangles`. Audit tags against rules;
  use `appliedDisjunctively: true` with both spellings.
- Discounts: `discountCodeBasicCreate` with `context: {all: ALL}`, `appliesOncePerCustomer`,
  `minimumRequirement.quantity.greaterThanOrEqualToQuantity: "2"`. Times are UTC (IST − 5:30).
- Shop money format ("Rs. {{amount}}") is an admin setting, not theme code.
