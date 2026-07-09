# ASHRAF — Cloudflare Worker setup (Groq proxy + private knowledge base)

The worker is now a REQUIRED part of ASHRAF:
- It holds the **Groq API key** as a secret (no key in the browser anymore).
- It holds the **private training knowledge base** (Statsbomb spec, app guide,
  program info) that makes ASHRAF's answers accurate. This knowledge must NOT
  be committed to this public repo — the deployed worker code comes from the
  **private file** the Training Manager received (`ashraf-worker-PRIVATE.js`).
  The `worker.js` in this repo is the same code with the knowledge stripped,
  kept only for reference.

The app calls the worker at the URL in `CONFIG.WORKER_URL` (index.html). If the
worker is unreachable, the app falls back to calling Groq directly with the
locally-stored key (basic answers, no knowledge base).

Takes about 5 minutes, no coding.

## 1. Create the worker

1. Go to https://dash.cloudflare.com and log in (same account as `hudl-field-email`).
2. Sidebar: **Workers & Pages** → **Create** → **Create Worker**.
3. Name it exactly: `ashraf-coach`  ← the app expects
   `https://ashraf-coach.hudl-field.workers.dev`. Click **Deploy**.
4. Click **Edit code**, delete everything in the editor, and paste the ENTIRE
   contents of the PRIVATE file you received (`ashraf-worker-PRIVATE.js`).
5. Click **Deploy** (top right).

## 2. Add the Groq key as a secret

1. Open the worker's page → **Settings** → **Variables and Secrets** → **Add**.
2. Type: **Secret**. Name: `GROQ_API_KEY` (exactly, all caps).
   Value: a FRESH Groq key from https://console.groq.com (rotate the old one).
3. Save / Deploy.

## 3. Test

```bash
# Chat — should answer as ASHRAF using the knowledge base:
curl -sS https://ashraf-coach.hudl-field.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"يعني ايه ground pass؟"}]}'

# Arabic TTS — should save playable audio:
curl -sS https://ashraf-coach.hudl-field.workers.dev/tts \
  -H "Content-Type: application/json" \
  -d '{"model":"canopylabs/orpheus-arabic-saudi","voice":"abdullah","input":"أهلاً بيك في التدريب","response_format":"wav"}' \
  -o test.wav && file test.wav
```

## 4. After it works — clean the browser key (optional but recommended)

Open the live app with `#setup` at the end of the URL and save an EMPTY key.
The app then relies fully on the worker; the Groq key no longer exists anywhere
in the browser.

## Updating the knowledge later

Ask the assistant to regenerate `ashraf-worker-PRIVATE.js` with the new
material, then repeat step 1.4 (paste + Deploy). Nothing else changes.
