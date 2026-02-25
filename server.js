require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const PLAYLIST_ID = "PLlTrva6OzZKThknv28Xx9UTCMYkrL23JQ";

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
- Explain how the hints can be turned into a working solution, step by step.
- Key insight (one line).
- Steps (short bullet points).
- Time/space complexity (one line each).
Use plain text. No markdown headers. Keep under 200 words.`;

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

// Extract problem number from title or slug
function extractProblemNumber(title, slug) {
  // Try to find number in title first (e.g., "1. Two Sum" or "Two Sum - LeetCode 1")
  const titleMatch = title ? title.match(/\b(\d{1,4})\b/) : null;
  if (titleMatch) return titleMatch[1];
  
  // Try to find number in slug (e.g., "two-sum" -> might not have number, but some slugs do)
  const slugMatch = slug ? slug.match(/\b(\d{1,4})\b/) : null;
  if (slugMatch) return slugMatch[1];
  
  return null;
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

// YouTube API endpoint 
// POST /api/youtube
app.post('/api/youtube', async (req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ success: false, error: 'YOUTUBE_API_KEY not set' });
    }

    const { title, problemSlug } = getPayload(req);
    
    // Extract problem number
    const problemNumber = extractProblemNumber(title, problemSlug);
    
    if (!problemNumber) {
      // If no number found, fall back to first video
      const fallbackUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=1&playlistId=${PLAYLIST_ID}&key=${YOUTUBE_API_KEY}`;
      const fallbackRes = await fetch(fallbackUrl);
      const fallbackData = await fallbackRes.json();
      const fallbackVideoId = fallbackData.items?.[0]?.snippet?.resourceId?.videoId || null;
      return res.json({ success: true, data: { videoId: fallbackVideoId } });
    }

    // Fetch playlist items
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${PLAYLIST_ID}&key=${YOUTUBE_API_KEY}`;
    const ytRes = await fetch(url);
    const ytData = await ytRes.json();

    const items = ytData.items || [];
    let bestVideoId = null;

    // Search for video containing the problem number
    for (const item of items) {
      const videoTitle = item.snippet?.title || '';
      // Look for patterns like "1. Two Sum", "LeetCode 1", "#1", etc.
      if (videoTitle.includes(` ${problemNumber}.`) || 
          videoTitle.includes(`#${problemNumber}`) ||
          videoTitle.includes(`LeetCode ${problemNumber}`) ||
          videoTitle.match(new RegExp(`\\b${problemNumber}\\b`))) {
        bestVideoId = item.snippet.resourceId.videoId;
        break;
      }
    }

    // If no match found, return first video as fallback
    if (!bestVideoId && items.length > 0) {
      bestVideoId = items[0].snippet.resourceId.videoId;
    }

    return res.json({
      success: true,
      data: { videoId: bestVideoId }
    });

  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`DSAGENIE backend running on port ${PORT}`);
});