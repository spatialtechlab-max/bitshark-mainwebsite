import {
  buildPrompt,
  openrouterHeaders,
  rateLimit,
  referenceImageDataUrl,
} from './_helpers.js';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!rateLimit(req, res, 'generate', 60_000, 'meme')) return;

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
      headers: openrouterHeaders(),
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        modalities: ['image', 'text'],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: fullPrompt },
              { type: 'image_url', image_url: { url: referenceImageDataUrl() } },
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

    res.status(200).json({ image: imageUrl });
  } catch (err) {
    console.error('[Generate error]', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
