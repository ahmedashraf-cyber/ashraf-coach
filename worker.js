/**
 * ASHRAF coach — Cloudflare Worker proxy for Groq (chat + Arabic TTS).
 *
 * Why this exists:
 *  - Keeps the Groq API key OUT of the browser (stored as a Worker secret).
 *  - Adds proper CORS headers so the GitHub Pages app can call it, even if
 *    Groq's own /audio/speech endpoint refuses browser CORS.
 *
 * Endpoints (both POST, JSON body):
 *  - /chat : forwards {model, messages, temperature, max_tokens} to Groq chat completions.
 *  - /tts  : forwards {model, voice, input, response_format} to Groq audio/speech,
 *            streams the audio back.
 *
 * Setup (see WORKER_SETUP.md for click-by-click steps):
 *  1. Create a Worker in the Cloudflare dashboard, paste this file.
 *  2. Add a secret named GROQ_API_KEY with your Groq key.
 *  3. Put the worker URL into CONFIG.WORKER_URL in index.html.
 */

const ALLOWED_ORIGIN = "https://ahmedashraf-cyber.github.io";
const GROQ_BASE = "https://api.groq.com/openai/v1";

// Only these models may be requested through the proxy.
const ALLOWED_CHAT_MODELS = ["openai/gpt-oss-120b"];
const ALLOWED_TTS_MODELS = [
  "canopylabs/orpheus-arabic-saudi",
  "playai-tts-arabic",
  "playai-tts"
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}

async function handleChat(body, env) {
  if (!ALLOWED_CHAT_MODELS.includes(body.model)) {
    return jsonResponse({ error: "Chat model not allowed: " + body.model }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse({ error: "Missing messages" }, 400);
  }
  const res = await fetch(GROQ_BASE + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.GROQ_API_KEY
    },
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.6,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 600
    })
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}

async function handleTts(body, env) {
  if (!ALLOWED_TTS_MODELS.includes(body.model)) {
    return jsonResponse({ error: "TTS model not allowed: " + body.model }, 400);
  }
  const input = String(body.input || "").slice(0, 1800);
  if (!input) {
    return jsonResponse({ error: "Missing input text" }, 400);
  }
  const res = await fetch(GROQ_BASE + "/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.GROQ_API_KEY
    },
    body: JSON.stringify({
      model: body.model,
      voice: String(body.voice || ""),
      input: input,
      response_format: body.response_format === "mp3" ? "mp3" : "wav"
    })
  });
  if (!res.ok) {
    // Pass Groq's real status + error body through so the app can log it.
    const detail = await res.text();
    return jsonResponse(
      { error: "Groq TTS failed", status: res.status, detail: detail.slice(0, 500) },
      res.status
    );
  }
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "audio/wav",
      ...corsHeaders()
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "POST only. Endpoints: /chat, /tts" }, 405);
    }
    if (!env.GROQ_API_KEY) {
      return jsonResponse({ error: "GROQ_API_KEY secret is not set on this worker" }, 500);
    }
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: "Body must be JSON" }, 400);
    }
    const path = new URL(request.url).pathname;
    try {
      if (path === "/chat") return await handleChat(body, env);
      if (path === "/tts") return await handleTts(body, env);
      return jsonResponse({ error: "Not found. Endpoints: POST /chat, POST /tts" }, 404);
    } catch (e) {
      return jsonResponse({ error: "Worker error: " + (e && e.message) }, 502);
    }
  }
};
