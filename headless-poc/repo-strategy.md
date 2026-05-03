# Repo strategy: same repo or new repo for the Webflow frontend?

**Recommendation: a new, independent repo for the headless frontend.** Keep the PoC here while you evaluate, but split before any production traffic. This document explains why, what the new repo should look like, and how to migrate.

## The decisive reasons

### 1. This repo is being auto-written by the Shopify CLI

`git log --oneline` shows commits like `Update from Shopify for theme OmniFlex-Shopify-Theme/main` arriving regularly. That's the Shopify theme editor pushing changes back. **For a Liquid theme this is fine** — those files only affect Shopify rendering. **For a headless frontend it is dangerous** — every commit on `main` can move a jsDelivr-pinned tag silently, which means a non-engineer making a copy edit in the Shopify theme editor could change the live behavior of the Webflow storefront.

This alone justifies the split. Even if you pin to commit SHAs (which you should), an automated process committing to the same repo as your storefront source is a footgun.

### 2. Different deploy surfaces, different tooling

| Surface | Tool | Lives where |
|---|---|---|
| Liquid theme | Shopify CLI (`shopify theme push`) | This repo |
| Headless client JS | jsDelivr or a CDN, pinned to a commit | New repo |
| Sync worker | Wrangler (`wrangler deploy`) | New repo |
| Customer Account module | jsDelivr or a CDN | New repo |
| E2E tests | Playwright in CI | New repo |

The Shopify theme repo's CI surface is "validate Liquid + push to Shopify." The headless repo's is "type-check, build, run Playwright, deploy worker, publish CDN bundle." Mixing them means CI workflows constantly skip large parts of the repo and the failure surfaces are harder to reason about.

### 3. Different contributors, different access controls

Theme operators need Shopify admin and don't usually need GitHub Actions secrets. Headless engineers need Cloudflare account access, Webflow API tokens, and the ability to rotate Storefront tokens, but don't need Shopify admin. Putting the two roles in the same repo means giving everyone access to everything by default.

### 4. Different lifecycle, different risk profile

Once the Webflow rebuild ships, the Shopify theme stops getting marketing-page work — it becomes commerce-only and changes infrequently. The headless frontend becomes the high-velocity surface. Keeping them in one repo encourages cross-coupled commits and makes it harder to ship one without ceremonially deploying the other.

## When *would* a single repo make sense?

Only in narrow cases:
- The same one or two engineers maintain both surfaces and there are no designers or marketers committing
- The headless code is a thin shim (e.g. just a Buy Button SDK install) with no sync layer or worker
- There is no jsDelivr pinning in play because the script is hosted on a private CDN you control and the repo is just a build source

None of those describe OmniFlex's situation.

## Proposed structure of the new repo

```
omniflex-storefront-headless/
├── packages/
│   ├── client/           # was headless-poc/omniflex-headless.{js,css}
│   │   ├── src/
│   │   ├── dist/         # bundled, minified, sourcemapped
│   │   └── package.json  # esbuild build, publishes to npm or just tag releases
│   ├── customer-account/ # was headless-poc/customer-account/
│   ├── sync-worker/      # was headless-poc/sync/worker/
│   └── sync-poll/        # was headless-poc/sync/sync.mjs (CI reconciliation)
├── apps/
│   └── webflow-embeds/   # raw HTML snippets the Designer pastes
├── tests/                # was headless-poc/tests/
├── .github/workflows/
│   ├── ci.yml            # type-check + tests on PR
│   ├── release.yml       # tag a SHA, publish bundle to CDN, deploy worker
│   └── e2e-staging.yml   # Playwright vs. staging on push to main
├── README.md
└── pnpm-workspace.yaml
```

A monorepo (pnpm or npm workspaces) lets `client`, `customer-account`, and `sync-worker` share types and lint config without each becoming its own repo. Two repos minimum (this Shopify theme + the headless monorepo) is the right balance.

## How to migrate (when you're ready)

1. Stand up `omniflex-storefront-headless` as a new GitHub repo
2. `git subtree split --prefix=headless-poc -b export-headless` from this repo, push to the new repo's `main`
3. In the new repo, restructure into the package layout above
4. Add `release.yml` that publishes a bundle to a private CDN (Cloudflare R2 + Workers route is the natural fit) and pins versions
5. Update `headless-poc/webflow-embeds/site-wide-head.html` here to a temporary deprecation notice that points at the new repo's release tag URL
6. Delete `headless-poc/` from this repo in a follow-up commit. Keep the `docs/webflow-integration-investigation.md` here as the historical record.

Do this **once a real Webflow staging site is wired up** and the smoke tests pass — not before. Splitting empty scaffolds across two repos creates more setup work without payoff.

## Until then

Keep the PoC in `headless-poc/` on this branch. It's the right home for the evaluation phase. The split has a real cost (two CIs, two deploy keys, cross-repo issue tracking) and that cost is only worth paying once the architecture has earned it.
