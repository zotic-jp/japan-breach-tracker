# Japan Breach Tracker

A daily-updated league table of data breaches at Japanese organisations, with a guide to limiting your exposure.

Plan: https://claude.ai/artifact/9kNwBqX2qjca526ZLivmL4

## How it works

1. `.github/workflows/daily.yml` runs at 06:00 JST.
2. `collector/run.ts` reads the feeds in `collector/sources.ts`, keeps new articles that look like breach news, and asks Claude to extract the facts (`collector/extract.ts`).
3. New incidents and updates are written to `data/incidents/<id>.json` (schema: `schema/incident.ts`).
4. The workflow opens a pull request. A person checks each change against its sources and merges.
5. Cloudflare Pages rebuilds the static Astro site from `main`.

## Commands

```sh
npm install
npm run dev        # site at http://localhost:4321
npm test           # collector unit tests
npm run validate   # check every incident file
npm run check      # type-check
npm run build      # static site into dist/
ANTHROPIC_API_KEY=... npm run collect   # one collection run against live feeds
npm run logos      # save logos for new organizations into public/logos (Wikidata, then site icon)
```

`LOOKBACK_DAYS` (default 7) and `MAX_ARTICLES` (default 40) bound each run.

## Setup

- GitHub: add the `ANTHROPIC_API_KEY` repository secret, and allow GitHub Actions to create pull requests (Settings > Actions > General).
- Cloudflare Pages: connect the repository, build command `npm run build`, output directory `dist`, environment variable `SITE_URL` set to the public URL.

Pull requests opened by the daily workflow use the default `GITHUB_TOKEN`, so CI does not run on them automatically; the daily job runs the same checks before opening the pull request.

## Logos

Logos only identify each organization. If an owner asks for removal, delete its file in `public/logos/` and set its `organization.domain` to `null` so it isn't fetched again; the card falls back to initials.
