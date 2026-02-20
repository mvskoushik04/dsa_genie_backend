const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow Chrome extension origin (and localhost for dev)
const allowedOrigins = [
  'chrome-extension://*',
  'http://localhost:*',
  /^chrome-extension:\/\w+$/,
];
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

// Stub data generator (replace with real LLM/DB in production)
function getExplanation(problemSlug, title) {
  return `**Explanation for: ${title || problemSlug}**\n\nUnderstand the problem and constraints. Break it into steps and consider edge cases. This is a placeholder — connect your own solution source (e.g. LLM API) for real explanations.`;
}

function getPseudocode(problemSlug, title) {
  return `// Pseudocode: ${title || problemSlug}\n1. Parse input and validate\n2. Apply main algorithm\n3. Return result`;
}

function getCode(problemSlug, language) {
  const stubs = {
    cpp: `// ${problemSlug} - C++\nclass Solution {\npublic:\n    // Add your solution here\n};`,
    java: `// ${problemSlug} - Java\nclass Solution {\n    // Add your solution here\n}`,
    python: `# ${problemSlug} - Python\nclass Solution:\n    # Add your solution here\n    pass`,
  };
  return stubs[language] || stubs.cpp;
}

// YouTube: return search URL so user gets matching videos (no API key required)
function getYoutubeSearchUrl(problemSlug, title) {
  const q = encodeURIComponent(`LeetCode ${problemSlug} ${(title || '').trim()}`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

// LeetCode problem URL pattern: https://leetcode.com/problems/<slug>/
function parseProblemFromUrl(url) {
  if (!url || !url.includes('leetcode.com/problems/')) return null;
  const match = url.match(/leetcode\.com\/problems\/([^/]+)/);
  return match ? { slug: match[1] } : null;
}

// POST /api/explanation — body: { problemSlug?, title?, url? }
app.post('/api/explanation', (req, res) => {
  try {
    const { problemSlug, title, url } = req.body || {};
    const parsed = url ? parseProblemFromUrl(url) : null;
    const slug = problemSlug || parsed?.slug || 'unknown';
    const text = getExplanation(slug, title);
    res.json({ success: true, data: { explanation: text } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pseudocode
app.post('/api/pseudocode', (req, res) => {
  try {
    const { problemSlug, title, url } = req.body || {};
    const parsed = url ? parseProblemFromUrl(url) : null;
    const slug = problemSlug || parsed?.slug || 'unknown';
    res.json({ success: true, data: { pseudocode: getPseudocode(slug, title) } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/code — body: { problemSlug?, language: 'cpp'|'java'|'python', url? }
app.post('/api/code', (req, res) => {
  try {
    const { problemSlug, language, url } = req.body || {};
    const parsed = url ? parseProblemFromUrl(url) : null;
    const slug = problemSlug || parsed?.slug || 'unknown';
    const lang = ['cpp', 'java', 'python'].includes(language) ? language : 'cpp';
    res.json({ success: true, data: { code: getCode(slug, lang), language: lang } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/youtube — body: { problemSlug?, title?, url? }
app.post('/api/youtube', (req, res) => {
  try {
    const { problemSlug, title, url } = req.body || {};
    const parsed = url ? parseProblemFromUrl(url) : null;
    const slug = problemSlug || parsed?.slug || 'unknown';
    const searchUrl = getYoutubeSearchUrl(slug, title);
    res.json({ success: true, data: { url: searchUrl } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Health check for Render
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`DSAGENIE backend running on port ${PORT}`);
});
