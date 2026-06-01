# Deploying the NSB board Worker

The board is a Cloudflare Worker (`nsb-board`) defined by `worker.js` + `wrangler.toml`.
A GitHub Action (`.github/workflows/deploy.yml`) deploys it automatically whenever
`worker.js` changes on `main`. Listing data (`listings.json`) is fetched at runtime,
so listing updates never need a deploy.

## One-time setup

1. **Fill in the KV namespace id** in `wrangler.toml`.
   Run `wrangler kv namespace list` and paste the id for the `NSB_KV` namespace,
   replacing `REPLACE_WITH_NSB_KV_NAMESPACE_ID`. (Not secret — fine to commit.)

2. **Add two GitHub repo secrets** (Settings > Secrets and variables > Actions):
   - `CLOUDFLARE_API_TOKEN` — a token with the *Edit Cloudflare Workers* permission.
   - `CLOUDFLARE_ACCOUNT_ID` — the BCG corp Cloudflare account id.
   Never commit these to the repo.

3. **Set the Worker's share key as a secret** (kept out of this public repo):
   ```
   wrangler secret put VIEW_KEY
   ```
   Enter the current key (`greysteph-ocean`) or a rotated one. `env.VIEW_KEY`
   reads it the same as a plain var, and secrets survive redeploys.

## Deploying

- Automatic: push a change to `worker.js` on `main`.
- Manual: Actions tab > "Deploy Worker" > "Run workflow" (use this for the first
  deploy, or after editing `wrangler.toml`).

## Notes

- The daily `nsb-apartment-search` task commits only `listings.json`, which is not a
  workflow trigger — so it won't cause redeploys.
- If you'd like `wrangler.toml` edits to also auto-deploy, add `wrangler.toml` to the
  `paths:` list in the workflow.
