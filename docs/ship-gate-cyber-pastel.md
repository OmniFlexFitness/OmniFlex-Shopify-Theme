# Ship gate — cyber-pastel reskin (Phase 2)

## Code ready

- [x] Theme audit committed (`docs/theme-audit-2026-10.md`)
- [x] `assets/omniflex-tokens.css` (neon noir + cyber pastel)
- [x] Tokens wired in `layout/theme.liquid`
- [x] Neon hero / scroll-3d consume `--of-*` tokens
- [x] Cyber-divider glow tracks text color when glow left at generic `#ff2d55`
- [x] Theme Check CI workflow added (`.github/workflows/theme-check.yml`)

## Shopify admin steps

- [x] Jonny has his own collaborator account with shared access (some owner-only areas stay with Bertin)
- [x] Preview + visual QA of `OmniFlex-Shopify-Theme/main` (desktop + mobile)
- [x] Zenith product price set to **$45** in Shopify Admin (not theme code)
- [x] Homepage `custom_price: "$99.00"` confirmed placeholder: `ai_gen_block_0bd9121` block in `templates/index.json` is `"disabled": true` with no product attached, so it never renders
- [x] Merge PR → `main` (OmniFlex-Shopify-Theme#28 + CI follow-ups #29–#31; Theme Check green on main)
- [x] Published theme verified in Shopify admin; prior version kept in theme library for rollback

## Headless decision (after publish)

With audit data + reskin live, choose one:

1. **Stay Liquid** — continue iterating tokens / 3D PDP on Dawn
2. **Webflow hybrid B/B1** — marketing on Webflow, commerce on Shopify, edge stitch
3. **Full headless** — Hydrogen/Next (highest cost; not recommended as week-1 path)

Do **not** split `headless-poc/` into a new repo until option 2/3 is chosen and staging exists.
