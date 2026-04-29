import { EXPAND_SYSTEM_PROMPT, openrouterHeaders, rateLimit } from './_helpers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!rateLimit(req, res, 'expand', 5_000, 'expand')) return;

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
      headers: openrouterHeaders(),
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
    res.status(200).json({ expanded });
  } catch (err) {
    console.error('[Expand error]', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
