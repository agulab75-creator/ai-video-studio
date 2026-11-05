# Research notes (October 2026)

Most Indian CRO numbers come from agencies and app vendors. Treat them as direction, not truth, and check
against the store's own analytics.

## Competitor teardown (live homepages fetched 16 Oct 2026)

| Store | Platform | Notable homepage sections | Apps seen in page source | Offers / messaging |
|---|---|---|---|---|
| Kushal's | Shopify | announcement + image bar, many slideshows, square card carousels, "jewellery finder", app download banner, popup, wishlist | Judge.me, Razorpay, Snapmint, Wizzy search | "Free Shipping Anywhere in India for orders above Rs 499"; nav: type → collection → occasion; bangle filters include size 2-4/2-6/2-8, craft, occasion, colour, "Returnable" |
| Salty | Shopify | scrolling text bar, **circular category images**, badges, deal of the day, collection tabs, price-drop corner, testimonials, FAQ, "Diwali box" gift hampers | GoKwik, KwikPass, Judge.me, Wizzy | MRP strike + "44% OFF"; "In Demand · Ships 19th"; cart reward progress ("Add Rs. 699 more to unlock reward"); "Follow us on instagram" |
| Rubans | Shopify | announcement, **sale countdown**, search, slideshow, image grids, **shoppable videos** | GoKwik, KwikPass, Judge.me, Klaviyo, Shiprocket | "(66% Off)"; cart: "Get FLAT 25% OFF + Free Shipping — add products worth ₹1000 more" |
| Voylla | Shopify | top banner, collection products, brands, mobile toolbar, "someone purchased" | GoKwik, KwikPass, Judge.me | "Festive Sale - Extra ₹625 off on Orders above ₹2500 + 5% off on Prepaid Orders" |
| Yellow Chimes | Shopify | slideshow, two collection lists, featured collections, image banners, customer care | GoKwik, KwikPass, Judge.me, WATI | "Trusted By 3 Million+ Customers"; "Sitewide 15% Off On Purchase Of 2+ Products"; free shipping ₹499+ |
| Sukkhi | Shopify | collection strip, slideshow, text-with-icons, **shop by price**, gifts for her, shop the look, testimonials, visit stores, mobile strip links | Fastrr, GoKwik, Instafeed, Judge.me, Shiprocket | "100% Payment Secure · Free Shipping · 15 Days Return Policy"; MRP strike "Save 73%" |
| Isharya | Shopify | collection list, collection tabs, **shop the look**, blog, carousel tabs | Fastrr, **Instafeed**, Shiprocket, WATI | Instagram in header + feed |
| Aadyaa | Shopify | multi-column, many featured collections, slideshows, reviews widget | GoKwik, Interakt, Judge.me, Klaviyo, Swym, WATI | "Flat 30% OFF | On All Orders | Navratri Sale"; "from 1139 reviews" |
| GIVA | custom | pincode "Where to deliver?", mega menus by type/price/occasion/recipient | — | "Easy 15-Day Return Policy", "Pan India Free Shipping", BOGO / B2G1 tiles, "Gifting made easy: Under 1500/1999" |
| BlueStone | custom | — | — | trust: "30 DAY MONEY BACK", "CERTIFIED", "LIFETIME EXCHANGE"; FAQ on bangle measuring |

**What's working across them**: Judge.me reviews (6/8 Shopify stores), one-click checkout with COD risk
scoring (GoKwik/KwikPass/Fastrr: 6/8), WhatsApp (WATI/Interakt), free shipping at ₹499, MRP strikethrough
with % off everywhere, gift edits, festival-named sales, shop by price/occasion, Instagram/UGC.
**What's not**: 20+ stacked slideshows (Kushal's) hurt speed and focus; generic "upto 80% off" erodes a
premium feel; "someone purchased" popups read as fake; app-download banners on a small brand are noise.

## Market facts
- COD: 60–65% of Indian e-commerce orders (ET Prime 2024, via Razorpay); COD RTO 25–30% vs 2–3% prepaid.
  Jewellery-specific COD RTO 12–20%. — razorpay.com/blog/cash-on-delivery, cognitoitconsultancy.com
- Mobile is 70–80%+ of Indian jewellery/D2C traffic. — innovatrixinfotech.com, aimnlaunch.com
- Indian D2C conversion: ~1–2.5%. Add-to-cart 9–9.5%, cart abandonment ~75% (ecdb 2025).
- COD fee ₹49–99 cuts RTO 15–20% (agency claim). WhatsApp recovery: 3 messages at 30 min / 24 h / 48 h
  recover 15–20% of carts (agency claim). Sticky ATC +5–12% add-to-cart.
- Welcome discounts on Shopify: 10% is the most common (28% of stores), then 20% (22%); avg discount-popup
  CVR 8.6%, top decile 23.6% (Wisepops study).
- Hand/wrist "scale" shots cut size returns ~15–20% (agency claim). Bangle sizes are inner diameter;
  2.4 ≈ 5.7–6.0 cm, 2.6 ≈ 6.0–6.4 cm, 2.8 ≈ 6.4–6.9 cm depending on the seller's chart — state your own.
- Karwa Chauth 2026: Thursday 29 October (some panchangs say 28th). Search demand "karwa chauth bangles
  set" is a real Amazon.in term (rank ~1.87 lakh in week 41).
- Baymard (jewelry & watches benchmark 2025): sites look great but often skip thumbnails, callouts and
  zoomable views — give every image zoom and a thumbnail strip.
- Instagram: legacy and Basic Display APIs are dead (Dec 2024). Live feeds need a Business/Creator account
  and the Instagram API with Instagram Login, with the token held server-side (proxy) or an app.

## Sources
- https://www.innovatrixinfotech.com/blog/shopify-store-jewellery-brands
- https://aimnlaunch.com/shopify-conversion-rate-optimization-15-proven-tactics-that-took-indian-d2c-brands-from-1-to-3-5/
- https://razorpay.com/blog/cash-on-delivery/
- https://cognitoitconsultancy.com/ecommerce-conversion-rate/
- https://www.wisepops.com/blog/state-of-visitor-engagement-on-shopify-stores
- https://baymard.com/research-articles/jewelry-and-watches-2025-benchmark
- https://www.pngjewellers.com/blogs/png-blogs/bangle-size-chart-guide-for-indian-women
- https://help.shopify.com/en/manual/using-themes/instagram-feed-changes
- https://hindutone.com/festivals/karwa-chauth-2026-date-moonrise-vidhi/
- https://www.giva.co, https://www.bluestone.com/bangles.html, https://www.kushals.com/collections/bangles
- Homepage source of salty.co.in, rubans.in, voylla.com, isharya.com, aadyaa.com, yellowchimes.com, sukkhi.com
- CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023; Consumer Protection (E-Commerce) Rules, 2020
