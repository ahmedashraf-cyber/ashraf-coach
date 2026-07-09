# ASHRAF — Cloudflare Worker setup (Groq proxy)

Follow this ONLY if Arabic voice still fails after the model fix, **and** the browser
console (F12 → Console) shows `no HTTP response (network or CORS)` / `Failed to fetch`
for `[ASHRAF TTS]` lines. That means Groq's speech endpoint refuses browser requests,
and the worker below fixes it. It also removes the Groq key from the browser entirely
(chat goes through it too).

Takes about 5 minutes, no coding.

## 1. Create the worker

1. Go to https://dash.cloudflare.com and log in (same account as `hudl-field-email`).
2. In the left sidebar click **Workers & Pages** → **Create** → **Create Worker**.
3. Name it `ashraf-coach` and click **Deploy** (it deploys a placeholder first).
4. Click **Edit code**.
5. Delete everything in the editor, then copy the ENTIRE contents of `worker.js`
   from this repo and paste it in.
6. Click **Deploy** (top right).

## 2. Add the Groq key as a secret

1. Go back to the worker's page (click its name in Workers & Pages).
2. Open **Settings** → **Variables and Secrets** → **Add**.
3. Type: **Secret**. Name: `GROQ_API_KEY` (exactly, all caps).
   Value: your Groq API key (`gsk_...`). Use a FRESH key from
   https://console.groq.com — rotate the old one, it was shared in chat.
4. Click **Deploy** / **Save**.

## 3. Point the app at the worker

1. In `index.html`, find `WORKER_URL: ""` inside the `CONFIG` object near the top
   of the `<script>` block.
2. Set it to your worker URL, for example:
   `WORKER_URL: "https://ashraf-coach.hudl-field.workers.dev",`
   (No trailing slash needed; the app handles it either way.)
3. Commit + push, wait for GitHub Pages to go green, then hard-refresh
   (Ctrl+Shift+R) the live site.

Once `WORKER_URL` is set, the app stops sending the Groq key from the browser —
you can clear it from localStorage by opening the site with `#setup` and saving
an empty key.

## 4. Quick test

In a terminal (or ask any developer):

```bash
# Should return JSON with a chat reply:
curl -sS https://ashraf-coach.hudl-field.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-oss-120b","messages":[{"role":"user","content":"say hi"}]}'

# Should save playable Arabic audio:
curl -sS https://ashraf-coach.hudl-field.workers.dev/tts \
  -H "Content-Type: application/json" \
  -d '{"model":"canopylabs/orpheus-arabic-saudi","voice":"abdullah","input":"أهلاً بيك في التدريب","response_format":"wav"}' \
  -o test.wav && file test.wav
```

If `/tts` returns a JSON error instead of audio, the `detail` field contains
Groq's real error message (wrong model name, terms not accepted, etc.) — fix the
model/voice in `CONFIG.TTS_ARABIC_CANDIDATES` in `index.html` accordingly.
