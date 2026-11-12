# OmniFlex Shopify Theme

Welcome to the **OmniFlex Shopify Theme** repository! This project contains the custom Shopify theme used to power the OmniFlex website. The theme is designed to provide a seamless, responsive, and visually appealing shopping experience for customers while offering flexibility and customization options for store administrators.

---

## Table of Contents

- [Features](#features)
- [Folder Structure](#folder-structure)
- [Installation](#installation)
- [Development Workflow](#development-workflow)
- [CI and Shopify CLI](#ci-and-shopify-cli)
- [Customization](#customization)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Responsive Design**: Fully optimized for desktop, tablet, and mobile devices.
- **Customizable Sections**: Drag-and-drop sections for easy customization in the Shopify admin.
- **Slideshow with Infinite Looping**: A dynamic slideshow component with infinite scrolling functionality.
- **Announcement Bar**: Configurable announcement bar for promotions or updates.
- **Optimized Performance**: Lazy loading for images and reduced motion for accessibility.
- **Cross-Browser Compatibility**: Tested on all major browsers.
- **Custom CSS and JavaScript**: Easily extendable for advanced customizations.

---

## Folder Structure

The repository is organized as follows:

---

## CI and Shopify CLI

### What runs on a pull request

All jobs live in `.github/workflows/`.

| Job | Workflow | Blocking? | Needs |
|---|---|---|---|
| Shopify Theme Check | `theme-check.yml` | Advisory (see `docs/theme-check-baseline.md`) | nothing |
| Validate JSON templates | `theme-check.yml` | **Yes** | nothing |
| Development theme preview | `theme-check.yml` | Fails visibly if the push fails | `SHOPIFY_STORE`, `SHOPIFY_CLI_THEME_TOKEN` |
| Lighthouse CI | `theme-check.yml` | Advisory | `SHOPIFY_STORE`, `SHOPIFY_LHCI_CLIENT_ID`, `SHOPIFY_LHCI_CLIENT_SECRET` |
| Delete PR preview theme | `theme-preview-cleanup.yml` | Runs on PR close | `SHOPIFY_STORE`, `SHOPIFY_CLI_THEME_TOKEN` |

Jobs that need the store are **skipped** while `SHOPIFY_STORE` is unset.
Lighthouse also skips itself, with a notice, until its two secrets exist.

### Repository variables (Settings > Secrets and variables > Actions > Variables)

| Variable | Value | Used by |
|---|---|---|
| `SHOPIFY_STORE` | `omniflexfitness.myshopify.com` | preview, cleanup, Lighthouse |
| `LIGHTHOUSE_PRODUCT_HANDLE` | handle of a representative product | Lighthouse (defaults to the first product if empty) |
| `LIGHTHOUSE_COLLECTION_HANDLE` | handle of a representative collection | Lighthouse (defaults to the first collection if empty) |

### Repository secrets (Settings > Secrets and variables > Actions > Secrets)

| Secret | What it is | Used by |
|---|---|---|
| `SHOPIFY_CLI_THEME_TOKEN` | A Theme Access app password | preview, cleanup |
| `SHOPIFY_LHCI_CLIENT_ID` | Client ID of a Dev Dashboard app with `read_products` and `write_themes` | Lighthouse |
| `SHOPIFY_LHCI_CLIENT_SECRET` | Client secret of the same app | Lighthouse |

Never paste a token into a file, a commit, or a workflow. Reference it only as
`${{ secrets.NAME }}`.

#### Get a Theme Access password

1. In Shopify admin, install the **Theme Access** app (Apps > Shopify App Store > "Theme Access").
2. Open Theme Access and click **Create password**.
3. Enter a name (for example `GitHub CI`) and the email address of the CI owner. Shopify emails a one-time link to that address.
4. Open the link and copy the password (it starts with `shptka_`). It is shown once.
5. In GitHub, add it as the repository secret `SHOPIFY_CLI_THEME_TOKEN`.

#### Get Lighthouse credentials

The Lighthouse action cannot use a Theme Access password. It needs an app with
Admin API scopes. Since January 2026 these are created in the Shopify Dev
Dashboard (custom apps can no longer be created in the admin):

1. Create an app in the Dev Dashboard and give its version the scopes `read_products` and `write_themes`.
2. Install the app on `omniflexfitness.myshopify.com`.
3. Copy the app's client ID and client secret into `SHOPIFY_LHCI_CLIENT_ID` and `SHOPIFY_LHCI_CLIENT_SECRET`.

Lighthouse reports are uploaded to LHCI temporary public storage (unlisted
public URLs). They contain storefront preview URLs, not credentials.

### Preview theme lifecycle

1. Open a PR against `main`. CI pushes an unpublished theme named `PR #<number> preview`.
2. Push more commits. CI updates the same theme instead of creating a new one.
3. Close or merge the PR. `theme-preview-cleanup.yml` deletes that theme.

Shopify caps the theme library at 20 themes. If the preview push fails with a
theme limit error, delete stale themes in Online Store > Themes. Previews made
before this workflow existed are named `PR #<number> cyber-pastel preview` and
are not cleaned up automatically.

### Branch rules

- Engineering work goes on `feature/*`, `fix/*` or `chore/*` branches and reaches `main` through a PR.
- `main` also receives `shopify[bot]` commits from the theme editor (Shopify GitHub integration).
- Do not edit `config/settings_data.json`, `templates/*.json` or `sections/*-group.json` in a PR. The theme editor owns them, and edits conflict with `shopify[bot]` commits.

### Local commands

Install the CLI (needs Node.js 22.12 or newer):

```bash
npm install -g @shopify/cli@5
```

Run a local dev server against the store:

```bash
shopify theme dev --store omniflexfitness.myshopify.com
```

Push to a new unpublished theme without overwriting live customizer settings:

```bash
shopify theme push --unpublished --ignore config/settings_data.json
```

Lint the theme (same check CI runs):

```bash
shopify theme check
```

Never run `shopify theme publish`, and never push without `--unpublished` or
`--development`. `.shopifyignore` keeps `docs/`, `headless-poc/`, `scripts/`,
`.github/`, `.shopify/`, Markdown, archives and `*.backup` files out of every
CLI upload.
