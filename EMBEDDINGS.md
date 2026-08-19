# Semantic search, and how to change provider

The assistant matches questions to documents in two ways at once:

1. **Keywords** — fast, exact, good at names and jargon ("anaphylaxis", "VSC").
2. **Meaning** — turns the question and each document into a vector describing
   what it *means*, so "a child is absent today" matches a policy phrased
   "child not arriving" even though they share no words.

The two rankings are combined by reciprocal rank fusion, so neither has to be
calibrated against the other and a failure of one does not sink the result.

If the meaning index is missing, stale, or the provider is unreachable, the
assistant silently falls back to keywords alone. It never goes down because an
embedding vendor is having a bad day.

---

## Current setup

| | |
|---|---|
| Provider | OpenAI |
| Model | `text-embedding-3-small` |
| Stored size | 512 dimensions, quantised to one byte each |
| Index | ~400 sections, ~270KB, held in the `STATE` namespace |
| Key used | `OPENAI_API_KEY` — the same secret that already answers questions |

Rebuild the index whenever policies or handbooks change:

```bash
curl -X POST https://cms-assistant-v2.shokbhl.workers.dev/admin/reindex \
  -H "Authorization: Bearer <admin token>"
```

Takes about ten seconds. Safe to re-run at any time — it replaces the index
wholesale rather than appending.

---

## Changing provider

Three steps, and nothing in the Worker's code changes:

```bash
# 1. add that vendor's key
npx wrangler secret put COHERE_API_KEY

# 2. point the Worker at it (in wrangler.toml, then deploy)
#    EMBEDDING_PROVIDER = "cohere"
npx wrangler deploy --keep-vars

# 3. rebuild the index with the new provider
curl -X POST .../admin/reindex -H "Authorization: Bearer <admin token>"
```

**Step 3 is not optional.** Vectors from different providers are not
comparable. The Worker records which provider and model built the index and
ignores it if they no longer match, falling back to keyword-only search — so
forgetting to reindex degrades quality quietly rather than breaking loudly.

Always use `--keep-vars`. Without it Wrangler deletes any variable not
declared in `wrangler.toml`, which currently includes `ADMIN_PIN`.

---

## The options

| `EMBEDDING_PROVIDER` | Model | Key needed | Notes |
|---|---|---|---|
| `openai` *(current)* | `text-embedding-3-small` | `OPENAI_API_KEY` | Already paid for. Very cheap; quality is strong. |
| `workersai` | `@cf/baai/bge-base-en-v1.5` | **none** | Runs inside Cloudflare. No third-party key, nothing leaves the account, lowest latency. Needs the `[ai]` binding uncommented in `wrangler.toml`. |
| `cohere` | `embed-english-v3.0` | `COHERE_API_KEY` | Strong at retrieval specifically; distinguishes question-vectors from document-vectors. Dearer than OpenAI. |
| `voyage` | `voyage-3-lite` | `VOYAGE_API_KEY` | Retrieval-specialised, competitively priced. |
| `gemini` | `text-embedding-004` | `GEMINI_API_KEY` | Google. Has a usable free tier. |

Adding another vendor means one entry in `PROVIDERS` in
[`lib/embeddings.js`](lib/embeddings.js) — a `model`, a `dims`, the name of its
secret, and an `embed()` that returns one vector per input.

### Which to move to

**`workersai` is the one worth considering.** Not because OpenAI is expensive
— indexing everything costs a fraction of a cent and each question adds
roughly a thousandth of one — but because of what it avoids:

- **No third-party key to hold, rotate, or leak.** One less credential.
- **Policy text stops leaving Cloudflare.** For a school handling children's
  safeguarding and medical procedures, keeping the corpus inside the
  infrastructure already trusted with it is a real reduction in exposure, and
  an easier answer if anyone asks where the data goes.
- **Lower latency**, because there is no call out to another vendor's API.
- It is billed as part of Workers, with a daily allocation included.

The trade-off is quality: `bge-base-en-v1.5` is a smaller, older model than
`text-embedding-3-small`, so expect somewhat weaker matching on unusual
phrasing. Worth measuring before committing — switch the provider, reindex,
and re-run the questions in `test/retrieval-benchmark.json` through
`/admin/diagnose` to compare the two on your own documents rather than on
anyone's published leaderboard.

Check current prices with each vendor before deciding; they change, and the
figures above are deliberately relative rather than exact.

---

## Diagnosing a bad answer

To see what retrieval considered for a question, and why:

```bash
curl -G https://cms-assistant-v2.shokbhl.workers.dev/admin/diagnose \
  -H "Authorization: Bearer <admin token>" \
  --data-urlencode "q=what if a child did not show up" \
  --data-urlencode "campus=MC"
```

Returns the ranked shortlist actually sent to the model, each entry carrying
its keyword score and its meaning score. `"semantic": false` means the index
was missing or stale and only keywords were used — usually a sign that a
reindex is needed after changing provider.

Nothing is logged and no answer is generated, so it is cheap to run.
