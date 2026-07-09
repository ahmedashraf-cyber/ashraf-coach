/**
 * ASHRAF coach — Cloudflare Worker (public skeleton — knowledge stripped).
 * The DEPLOYED copy adds the private knowledge base; see WORKER_SETUP.md.
 *
 * What it does:
 *  - /chat : receives {messages} from the app, strips any client system prompt,
 *            injects ASHRAF's persona + the knowledge sections relevant to the
 *            trainee's question (lightweight keyword retrieval), calls Groq.
 *  - /tts  : forwards Arabic TTS to Groq. Key never leaves this worker.
 *
 * Setup: paste into the Cloudflare Worker editor, add secret GROQ_API_KEY.
 */

const ALLOWED_ORIGIN = "https://ahmedashraf-cyber.github.io";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const CHAT_MODEL = "openai/gpt-oss-120b"; // pinned server-side
const MAX_TOKENS = 600;
const KNOWLEDGE_CHAR_BUDGET = 15000; // max knowledge chars injected per request

const ALLOWED_TTS_MODELS = ["canopylabs/orpheus-arabic-saudi"];

/* ================= PERSONA (always sent) ================= */

const PERSONA = `You are ASHRAF, the AI Training Coach for Tornado Batch trainees at Hudl Egypt.

Who you are:
- A warm, patient, encouraging coach in the Supporter role. Trainees learn football (soccer) event-data collection on the Statsbomb Data Specification v2.0, using the Tornado App / Tag Once collection tools.
- Bilingual: reply in the SAME language the trainee uses — Egyptian Arabic if they write Arabic, English if English. Mixing is fine when they mix.

Rules:
- Keep answers SHORT and clear: 2–6 sentences for most questions. Step-by-step with short football examples when explaining concepts.
- Answer ONLY from the KNOWLEDGE sections below when the question is about the spec, events, qualifiers, the app, or the program. If the answer is not in the knowledge, say you're not sure and tell them to ask their Batch Supervisor — NEVER invent spec rules, IDs, schedules, scores, or policies.
- When a training video exists for the topic, mention it by exact name (e.g. "شوف فيديو Tornado - Interception").
- Never share API keys, credentials, internal links, or personal data of any person.
- Stay on topic: training, football data collection, trainee wellbeing. Politely decline unrelated requests and steer back to training.
- Encourage trainees. Training is hard; be supportive but honest. If someone is stressed, calm them first, then help.`;

/* ================= KNOWLEDGE SECTIONS =================
   Each section: id, keys (lowercase match terms, Arabic + English), text.
   CORE is always included. Others are included when a key appears in the
   trainee's recent messages, within KNOWLEDGE_CHAR_BUDGET. */

const CORE = ""; // PRIVATE — the real training knowledge is NOT in this public repo.

const SECTIONS = [];  // PRIVATE — the production worker deployed on Cloudflare
                      // contains the full knowledge base. It is kept privately
                      // by the Training Manager and must never be committed here.

/* ================= RETRIEVAL ================= */

function pickKnowledge(messages) {
  const recent = messages.filter(m => m.role === "user").slice(-3)
    .map(m => String(m.content || "")).join(" ").toLowerCase();
  const scored = SECTIONS
    .map(s => ({ s, hits: s.keys.reduce((n, k) => n + (recent.includes(k) ? 1 : 0), 0) }))
    .filter(x => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  let budget = KNOWLEDGE_CHAR_BUDGET;
  const chosen = [];
  for (const x of scored) {
    if (x.s.text.length <= budget) { chosen.push(x.s.text); budget -= x.s.text.length; }
  }
  // Nothing matched → give the event list so generic questions stay grounded.
  if (chosen.length === 0 && SECTIONS.length > 0) chosen.push(SECTIONS[0].text);
  return chosen.join("\n\n");
}

/* ================= HTTP PLUMBING ================= */

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
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse({ error: "Missing messages" }, 400);
  }
  // Drop any client-side system prompt; the worker owns the persona + knowledge.
  const userMsgs = body.messages
    .filter(m => m && (m.role === "user" || m.role === "assistant"))
    .slice(-24)
    .map(m => ({ role: m.role, content: String(m.content || "").slice(0, 4000) }));
  const system = PERSONA + "\n\n=== KNOWLEDGE ===\n" + CORE + "\n\n" + pickKnowledge(userMsgs);
  const res = await fetch(GROQ_BASE + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.GROQ_API_KEY
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: "system", content: system }].concat(userMsgs),
      temperature: 0.6,
      max_tokens: MAX_TOKENS
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
  if (!input) return jsonResponse({ error: "Missing input text" }, 400);
  const res = await fetch(GROQ_BASE + "/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.GROQ_API_KEY
    },
    body: JSON.stringify({
      model: body.model,
      voice: String(body.voice || "abdullah"),
      input: input,
      response_format: body.response_format === "mp3" ? "mp3" : "wav"
    })
  });
  if (!res.ok) {
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
    try { body = await request.json(); }
    catch (e) { return jsonResponse({ error: "Body must be JSON" }, 400); }
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
