# Hiro PR Tracker

Tracker for PRs authored by `wert23239` in `KouperHealth/hiro`.

```bash
npm run refresh
npm run encrypt
npm run serve
```

Open `http://127.0.0.1:8092`.

Temporary password: `openclaw`.

The refresh step uses your existing GitHub CLI auth and writes private plaintext to `data/prs.json`. The encrypt step writes `data/prs.enc.json`, which is safe to host on GitHub Pages because the browser decrypts it after password entry. The site does not ship a GitHub token to the browser.

Resolved GitHub review threads are filtered out during refresh, so fixed/closed code review comments do not appear in the tracker.

The optional Node server uses HTTP Basic Auth for every route, including `data/prs.json`. If deployed on Vercel, set `HIRO_TRACKER_PASSWORD` to change the HTTP Basic Auth password; username is `hiro`.

Ignore state is shared through Supabase table `hiro_pr_ignores`, so Alex and TJ see the same active comments/failures. Use the User selector before ignoring an item if you want the row tagged correctly.

By default it tracks open PRs. To include closed and merged PRs too:

```bash
HIRO_PR_STATE=all npm run refresh
```
