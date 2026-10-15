# Ship gate — cyber-pastel reskin (Phase 2)

## Code ready

- [x] Theme audit committed (`docs/theme-audit-2026-10.md`)
- [x] `assets/omniflex-tokens.css` (neon noir + cyber pastel)
- [x] Tokens wired in `layout/theme.liquid`
- [x] Neon hero / scroll-3d consume `--of-*` tokens
- [x] Cyber-divider glow tracks text color when glow left at generic `#ff2d55`
- [x] Theme Check CI workflow added (`.github/workflows/theme-check.yml`)

## Blocked on humans / Shopify access

- [ ] Bertin invites Jonny as Shopify collaborator (staff)
- [ ] Create unpublished preview theme from `feature/cyber-pastel-reskin` and visual QA (desktop + mobile)
- [ ] Bertin sets Zenith product price **$45** in Shopify Admin (not theme code)
- [ ] Confirm homepage `custom_price: "$99.00"` block in `templates/index.json` is placeholder demo only (or update copy)
- [ ] Merge PR → `main` (Shopify GitHub sync may also push editor commits — coordinate)
- [ ] Publish theme from Shopify admin; keep prior published version for rollback

## Headless decision (after publish)

With audit data + reskin live, choose one:

1. **Stay Liquid** — continue iterating tokens / 3D PDP on Dawn
2. **Webflow hybrid B/B1** — marketing on Webflow, commerce on Shopify, edge stitch
3. **Full headless** — Hydrogen/Next (highest cost; not recommended as week-1 path)

Do **not** split `headless-poc/` into a new repo until option 2/3 is chosen and staging exists.
