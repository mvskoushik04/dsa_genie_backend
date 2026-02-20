require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

if (!GROQ_API_KEY) {
  console.warn('GROQ_API_KEY is not set in .env. Explanation, pseudocode, and code endpoints will return an error until you add it.');
}

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost')) return cb(null, true);
      return cb(null, true);
    },
    methods: ['GET', 'POST'],
  })
);
app.use(express.json());

// --- Prompts: specific, clean, no fluff ---

const EXPLANATION_SYSTEM = `You are a concise DSA tutor. Give only what is needed: no intros, no filler, no "in conclusion".
Output format:
- 1–2 sentences: what the problem asks.
- Key insight (one line).
- Steps (short bullet points).
- Time/space complexity (one line each).
Use plain text. No markdown headers. Keep under 150 words.`;

function buildExplanationUser(problemTitle, problemSlug, problemDescription) {
  const desc = problemDescription && problemDescription.trim()
    ? problemDescription.trim().slice(0, 6000)
    : `LeetCode problem: ${problemTitle || problemSlug}`;
  return `Problem: ${problemTitle || problemSlug}\n\nProblem statement:\n${desc}\n\nProvide a short, specific explanation.`;
}

const PSEUDOCODE_SYSTEM = `You output minimal pseudocode only. Rules:
- No long comments. At most one short line per block.
- Use clear variable names and standard constructs (loops, conditionals).
- Match the algorithm steps only. No "read input" or "return output" fluff unless non-obvious.
- Keep it under 25 lines.`;

function buildPseudocodeUser(problemTitle, problemSlug, problemDescription) {
  const desc = problemDescription && problemDescription.trim()
    ? problemDescription.trim().slice(0, 6000)
    : `LeetCode problem: ${problemTitle || problemSlug}`;
  return `Problem: ${problemTitle || problemSlug}\n\nStatement:\n${desc}\n\nOutput only the pseudocode, nothing else.`;
}

const CODE_SYSTEM = `You output a single, correct LeetCode solution. Rules:
- Exact function/class signature expected by LeetCode for this problem. No extra driver code.
- Clean, readable code. Comments only where logic is non-obvious.
- No "Explanation:" or extra text before/after the code. Output only the code.`;

function buildCodeUser(problemTitle, problemSlug, problemDescription, language) {
  const desc = problemDescription && problemDescription.trim()
    ? problemDescription.trim().slice(0, 6000)
    : `LeetCode problem: ${problemTitle || problemSlug}`;
  const langName = { cpp: 'C++', java: 'Java', python: 'Python' }[language] || 'C++';
  return `Problem: ${problemTitle || problemSlug}\n\nStatement:\n${desc}\n\nProvide the complete, runnable LeetCode solution in ${langName} only. No explanation, only code.`;
}

async function groqComplete(systemPrompt, userPrompt) {
  if (!groq) throw new Error('GROQ_API_KEY not set. Add it to backend .env (local) or Render Environment (deployed).');
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 2048,
    temperature: 0.2,
  });
  const text = completion?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from Groq');
  return text;
}


// YouTube-related playlist/search helpers removed

function parseProblemFromUrl(url) {
  if (!url || !url.includes('leetcode.com/problems/')) return null;
  const match = url.match(/leetcode\.com\/problems\/([^/?#]+)/);
  return match ? { slug: match[1] } : null;
}

function getPayload(req) {
  const body = req.body || {};
  const parsed = body.url ? parseProblemFromUrl(body.url) : null;
  return {
    problemSlug: body.problemSlug || parsed?.slug || 'unknown',
    title: body.title ?? null,
    url: body.url ?? null,
    problemDescription: body.problemDescription ?? null,
  };
}

// POST /api/explanation — body: { problemSlug?, title?, url?, problemDescription? }
app.post('/api/explanation', async (req, res) => {
  try {
    const { problemSlug, title, problemDescription } = getPayload(req);
    const userPrompt = buildExplanationUser(title, problemSlug, problemDescription);
    const explanation = await groqComplete(EXPLANATION_SYSTEM, userPrompt);
    res.json({ success: true, data: { explanation } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pseudocode
app.post('/api/pseudocode', async (req, res) => {
  try {
    const { problemSlug, title, problemDescription } = getPayload(req);
    const userPrompt = buildPseudocodeUser(title, problemSlug, problemDescription);
    const pseudocode = await groqComplete(PSEUDOCODE_SYSTEM, userPrompt);
    res.json({ success: true, data: { pseudocode } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/code — body: { problemSlug?, title?, url?, problemDescription?, language: 'cpp'|'java'|'python' }
app.post('/api/code', async (req, res) => {
  try {
    const payload = getPayload(req);
    const language = ['cpp', 'java', 'python'].includes(req.body?.language) ? req.body.language : 'cpp';
    const userPrompt = buildCodeUser(payload.title, payload.problemSlug, payload.problemDescription, language);
    const code = await groqComplete(CODE_SYSTEM, userPrompt);
    res.json({ success: true, data: { code, language } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// YouTube API endpoint removed

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`DSAGENIE backend running on port ${PORT}`);
});