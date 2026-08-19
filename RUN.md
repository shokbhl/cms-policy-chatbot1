# Running the chatbot

Everything you need is already installed (Node 24, wrangler 4.51). All commands run from
this folder: `~/Desktop/cms-chatbot-v2/cms-policy-chatbot`.

---

## The one thing that trips people up

`wrangler dev` defaults to **local mode**, where KV is an empty simulation on your machine.
The app will start and you can log in, but every question answers *"No matching documents"*
because there is no content.

To read your **real** policies and handbooks, use:

```bash
npx wrangler dev --remote
```

`--remote` is what connects to the actual KV namespaces.

---

## Full setup (once)

### 1. Log in to Cloudflare

```bash
npx wrangler login
```

### 2. Get your existing namespace ids

```bash
npx wrangler kv namespace list
```

Copy the ids for `cms_policies`, `cms_protocols` and `cms_handbooks` into `wrangler.toml`,
replacing the `<ID_OF_EXISTING_…>` placeholders.

> ⚠️ Use the **existing** ids. Creating new namespaces gives v2 empty stores and it will
> answer nothing.

### 3. Create v2's own state namespace

```bash
npx wrangler kv namespace create cms_v2_state
```

Put that id in the `STATE` binding. This keeps v2's sessions and logs out of v1's `cms_logs`.

### 4. Add your secrets for local dev

```bash
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars` with your real staff code, parent code, admin PIN and OpenAI key.
It is gitignored and never committed.

---

## Run it

Two terminals.

**Terminal 1 — the backend:**

```bash
npx wrangler dev --remote
```

Wait for `Ready on http://localhost:8787`.

**Terminal 2 — the frontend:**

```bash
npx serve public
```

(or `python3 -m http.server 3000 --directory public`)

Open the URL it prints. The frontend detects localhost and talks to `localhost:8787`
automatically — no editing needed.

**Then:** pick a campus, enter your staff or parent code, and ask something like
*"what happens if a parent is late for pickup?"*

---

## Quick checks

```bash
# is the backend up?
curl http://localhost:8787/health

# does your code work?
curl -X POST http://localhost:8787/auth/staff \
  -H 'Content-Type: application/json' \
  -d '{"code":"YOUR_STAFF_CODE"}'
```

A token in the response means auth and KV are wired correctly.

---

## Deploying

```bash
# secrets for the deployed Worker (separate from .dev.vars)
npx wrangler secret put STAFF_CODE
npx wrangler secret put PARENT_CODE
npx wrangler secret put ADMIN_PIN
npx wrangler secret put OPENAI_API_KEY

npx wrangler deploy                    # Worker: cms-assistant-v2
npx wrangler pages deploy public       # frontend
```

Then set `WORKER_BASE` in `public/app.js`, `public/dashboard.js` and `public/logs.js` to your
deployed Worker URL (replace `YOUR-SUBDOMAIN`), and set `ALLOWED_ORIGINS` in `wrangler.toml`
to your Pages origin instead of `*`.

**v1 is unaffected.** Different Worker name, different Pages project, its own state namespace.
The content namespaces are bound read-only.

---

## Tests

```bash
node --test test/worker.test.mjs
```

41 tests, no network needed — KV is mocked and OpenAI is stubbed.

---

## If something's wrong

| Symptom | Cause |
|---|---|
| Every answer is "No matching documents" | Running without `--remote`, or wrong KV ids |
| `Missing entry-point to Worker script` | Wrong folder — run from the one holding `wrangler.toml` |
| Login says "code not recognised" | `.dev.vars` missing or the code doesn't match |
| `OPENAI_API_KEY is not configured` | Not set in `.dev.vars` |
| Chat 401s straight after login | Signed in as admin — admin can't chat by design |
| Dashboard/Logs ask for a PIN repeatedly | Admin token expired (8 hours) |
