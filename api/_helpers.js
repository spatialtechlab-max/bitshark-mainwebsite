import fs from 'node:fs';
import path from 'node:path';

let cachedRefImage = null;
export function referenceImageDataUrl() {
  if (cachedRefImage) return cachedRefImage;
  const buf = fs.readFileSync(path.join(process.cwd(), 'assets', 'shark-main.jpeg'));
  cachedRefImage = `data:image/jpeg;base64,${buf.toString('base64')}`;
  return cachedRefImage;
}

export const buildPrompt = (userScene) => `Create a HYPER-REALISTIC, cinematic photo-style meme image.

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

export const EXPAND_SYSTEM_PROMPT = `You are a viral memecoin meme prompt writer. Take a SHORT user idea and rewrite it as PUNCHY, ABSURD meme fuel for an AI image generator.

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

const cooldowns = { generate: new Map(), expand: new Map() };

export function rateLimit(req, res, kind, windowMs, label) {
  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const map = cooldowns[kind];
  const now = Date.now();
  const last = map.get(ip);
  if (last && now - last < windowMs) {
    const wait = Math.ceil((windowMs - (now - last)) / 1000);
    res.setHeader('Retry-After', String(wait));
    res.status(429).json({
      error: `Slow down — wait ${wait}s before your next ${label} 🦈`,
      retryAfter: wait,
    });
    return false;
  }
  map.set(ip, now);
  return true;
}

export function openrouterHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://bitshark.fun',
    'X-Title': 'Bitshark Meme Factory',
  };
}
