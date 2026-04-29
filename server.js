import express from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8765;

app.set('trust proxy', 1);

const ALLOWED_ORIGINS = new Set([
  'https://bitshark.fun',
  'https://www.bitshark.fun',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname, { extensions: ['html'] }));

const generateCooldown = new Map();
const expandCooldown = new Map();

function rateLimit(map, windowMs, label) {
  return (req, res, next) => {
    const ip =
      (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';
    const now = Date.now();
    const last = map.get(ip);
    if (last && now - last < windowMs) {
      const wait = Math.ceil((windowMs - (now - last)) / 1000);
      res.set('Retry-After', String(wait));
      return res.status(429).json({
        error: `Slow down — wait ${wait}s before your next ${label} 🦈`,
        retryAfter: wait,
      });
    }
    map.set(ip, now);
    next();
  };
}

setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const m of [generateCooldown, expandCooldown]) {
    for (const [ip, ts] of m) if (ts < cutoff) m.delete(ip);
  }
}, 60_000).unref();

const REFERENCE_IMAGE_DATA_URL = (() => {
  const buf = fs.readFileSync(path.join(__dirname, 'assets', 'shark-main.jpeg'));
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
})();

const buildPrompt = (userScene) => `Create a HYPER-REALISTIC, cinematic photo-style meme image.

SUBJECT (must match the reference image style):
- A vibrant ORANGE shark — bright Bitcoin-orange / red-orange skin, white belly, photorealistic, powerful and detailed (like a real great white but bright orange in color, exactly like the attached reference photo).
- Expression should feel bold, mischievous, or heroic — meme energy.

REQUIRED TEXT IN IMAGE (critical):
- The word "BITSHARK" must appear PROMINENTLY somewhere in the image.
- Render it in bold, large, perfectly readable letters (black or white, sans-serif, sharp). It should look integrated into the scene (a sign, a banner, sky text, neon, engraved, etc.) — like a movie poster or viral memecoin meme.
- Do NOT add any other words or text besides "BITSHARK". No watermarks, no captions, no extra letters.

SCENE: ${userScene}

STYLE:
- Hyper-realistic photograph, cinematic lighting, vibrant saturated colors, dramatic composition, shallow depth of field where appropriate.
- Punchy crypto-memecoin aesthetic — instantly shareable, eye-catching, premium-quality.
- Square or 4:3 framing, high detail, sharp focus on the shark.

Do not output cartoon, anime, or low-quality art. The result must look like a real photo.`;

const EXPAND_SYSTEM_PROMPT = `You are a viral memecoin meme prompt writer. Take a SHORT user idea and rewrite it as PUNCHY, ABSURD meme fuel for an AI image generator.

CONSTANTS (already enforced by another layer — DO NOT mention these):
- Subject is a vibrant orange shark called "BITSHARK".
- The word "BITSHARK" will appear in the image.
- Hyper-realistic photo style.

YOUR JOB: make it MEME MATERIAL. Funny, absurd, weird, instantly shareable on Twitter/X. Think viral crypto meme, NOT film school. Make a degen retweet it AND a 12-year-old laugh.

Build ONE tight paragraph (35–55 words MAX) containing:
- A specific, weird scene with ONE absurd twist
- ONE concrete prop / sign / label / item that adds humor (e.g. a yacht labeled INSIDERS, a whale labeled DUMP, a chain that says WAGMI, a briefcase spilling cash, sunglasses, a tiny crown, a sidekick goldfish, etc.)
- Camera framing in a few words (low angle, drone shot, wide shot, fisheye, over-the-shoulder)
- Lighting in 2–3 words (golden hour / neon Miami / stormy / harsh noon / sunset glow)
- Mood vibe (chaotic, smug, heroic, deranged, luxurious, deadpan)

HARD RULES:
- 35–55 WORDS. Count. Shorter is better.
- NO purple prose. Banned: "majestically", "ethereal", "shimmering", "gracefully", "soars", "magnificent", "otherworldly".
- Punchy verbs. Concrete nouns. Real-world brands and places are great (Wall Street, Miami, Lambo, Rolex, McDonald's, Times Square).
- ONE flowing paragraph. No quotes, no labels, no preamble, no "here is".`;

app.post('/api/expand', rateLimit(expandCooldown, 5_000, 'expand'), async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 2) {
      return res.status(400).json({ error: 'Type something to expand first.' });
    }
    if (prompt.length > 600) {
      return res.status(400).json({ error: 'Prompt too long (max 600 chars).' });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'Server is missing OPENROUTER_API_KEY.' });
    }

    const orResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': `http://localhost:${PORT}`,
        'X-Title': 'Bitshark Meme Factory',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: EXPAND_SYSTEM_PROMPT },
          { role: 'user', content: `Seed idea: ${prompt.trim()}` },
        ],
        temperature: 1.05,
        max_tokens: 160,
      }),
    });

    if (!orResp.ok) {
      const errText = await orResp.text();
      console.error('[Expand error]', orResp.status, errText.slice(0, 500));
      return res.status(502).json({
        error: `Expansion failed (${orResp.status}). ${errText.slice(0, 200)}`,
      });
    }

    const data = await orResp.json();
    let expanded = data?.choices?.[0]?.message?.content;
    if (typeof expanded !== 'string' || !expanded.trim()) {
      return res.status(502).json({ error: 'Model returned no text. Try again.' });
    }
    expanded = expanded.trim().replace(/^["']|["']$/g, '').trim();
    res.json({ expanded });
  } catch (err) {
    console.error('[Expand error]', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

app.post('/api/generate', rateLimit(generateCooldown, 60_000, 'meme'), async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
      return res.status(400).json({ error: 'Type a meme idea (at least 3 characters).' });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ error: 'Prompt too long (max 2000 characters).' });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'Server is missing OPENROUTER_API_KEY.' });
    }

    const fullPrompt = buildPrompt(prompt.trim());

    const orResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': `http://localhost:${PORT}`,
        'X-Title': 'Bitshark Meme Factory',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        modalities: ['image', 'text'],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: fullPrompt },
              { type: 'image_url', image_url: { url: REFERENCE_IMAGE_DATA_URL } },
            ],
          },
        ],
      }),
    });

    if (!orResp.ok) {
      const errText = await orResp.text();
      console.error('[OpenRouter error]', orResp.status, errText.slice(0, 800));
      return res.status(502).json({
        error: `Image generation failed (${orResp.status}). ${errText.slice(0, 240)}`,
      });
    }

    const data = await orResp.json();
    const message = data?.choices?.[0]?.message;
    let imageUrl = null;

    if (Array.isArray(message?.images) && message.images.length) {
      const first = message.images[0];
      imageUrl = first?.image_url?.url || first?.url || null;
    }
    if (!imageUrl && Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part?.type === 'image_url' && part?.image_url?.url) {
          imageUrl = part.image_url.url;
          break;
        }
        if (part?.type === 'output_image' && part?.image_url) {
          imageUrl = part.image_url;
          break;
        }
      }
    }

    if (!imageUrl) {
      console.error('[No image in response]', JSON.stringify(data).slice(0, 800));
      return res.status(502).json({
        error: 'Model returned no image. Try a different prompt.',
      });
    }

    res.json({ image: imageUrl });
  } catch (err) {
    console.error('[Generate error]', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(process.env.OPENROUTER_API_KEY),
    model: 'google/gemini-2.5-flash-image',
  });
});

app.listen(PORT, () => {
  console.log(`🦈 Bitshark running at http://localhost:${PORT}`);
});
