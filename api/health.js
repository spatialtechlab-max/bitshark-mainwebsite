export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    hasKey: Boolean(process.env.OPENROUTER_API_KEY),
    model: 'google/gemini-2.5-flash-image',
  });
}
