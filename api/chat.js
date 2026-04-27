// =============================================================
// api/chat.js — OpenRouter Serverless Proxy
// =============================================================

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  // Now using OPENROUTER_API_KEY
  const API_KEY = process.env.OPENROUTER_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not set in Vercel." });
  }

  try {
    // OpenRouter uses standard OpenAI-style message format
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://smart-investment-guide.vercel.app", // Optional
        "X-Title": "Smart Investment Guide"
      },
      body: JSON.stringify({
        model: "inclusionai/ling-2.6-1t:free", 
        messages: req.body.messages,
        temperature: req.body.temperature || 0.4,
        max_tokens: req.body.max_tokens || 500
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "OpenRouter Error" });
    }

    // Return the response in a flat format for the frontend
    res.status(200).json({
      text: data.choices[0].message.content
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
