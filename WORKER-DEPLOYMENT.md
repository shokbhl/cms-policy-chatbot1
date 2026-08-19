# v1 backend — deployment reference

`worker.js` in this folder is the **live source of the `cms-policy-worker` Cloudflare
Worker**, pulled from Cloudflare on 2026-08-19 (version 150, last edited in the Cloudflare
dashboard on 2026-08-19T20:06Z).

Until now this file existed *only* inside Cloudflare. It was edited through the dashboard
and never committed, so the repository had no copy of the backend. It is committed here so
there is a recoverable copy.

## Live configuration

- Worker name: `cms-policy-worker`
- URL: `https://cms-policy-worker.shokbhl.workers.dev`
- compatibility_date: `2025-11-16`

### KV bindings

| Binding | Namespace id | Used by worker.js |
|---|---|---|
| `cms_policies` | `efa9baebff4d42e986076324c942d9fd` | yes |
| `cms_protocols` | `4e3bcd089a534628acb600263e855734` | yes |
| `cms_handbooks` | `0a0fcb0c5c5a4cc49dbfbfa47ec566cc` | yes |
| `cms_logs` | `f180c0b825ba4abb9f0e836622fe713f` | yes |
| `cms_parent_info` | `8ce1b7af88224340942872fe801fcbc0` | no — bound but unreferenced |
| `cms_parent_portal` | `3bc28e5e167842578605d78ff401cd14` | no — bound but unreferenced |
| `cms_parent_resources` | `40f0946b09c545da88af259011c0ecba` | no — bound but unreferenced |

### Secrets (values not stored here)

`STAFF_CODE`, `PARENT_CODE`, `ADMIN_PIN`, `OPENAI_API_KEY`

### Plain-text var

`WORKER_BASE_URL = https://cms-policy-worker.shokbhl.workers.dev`

## Frontend hosting

Cloudflare Pages project `cms-policy-chatbot1` → `cms-policy-chatbot1.pages.dev`,
connected to GitHub `shokbhl/cms-policy-chatbot1`, production branch `main`,
output directory `.` (repository root).

**Pushing to `main` deploys the live site automatically.**

Pages env vars: `OPENAI_API_KEY`, `WORKER_BASE_URL` (consumed by `functions/api.js`).

## Restoring this version

```bash
git show v1-final:worker.js > worker.js
npx wrangler deploy worker.js --name cms-policy-worker --compatibility-date 2025-11-16
```

Bindings and secrets are configured on the Worker itself and survive a redeploy of the
script, but confirm them in the dashboard afterwards.
