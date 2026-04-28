const ALLOWED_CATEGORIES = [
  "education",
  "market_interpretation",
  "portfolio_guidance",
  "risk_explanation",
  "app_help",
  "out_of_scope"
];

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    category: { type: "string", enum: ALLOWED_CATEGORIES },
    confidence: { type: "number" },
    scope: { type: "string", enum: ["bitcoin_crypto_only"] },
    followups: {
      type: "array",
      items: { type: "string" }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["answer", "category", "confidence", "scope", "followups", "warnings"]
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, body) {
  setCors(res);
  res.status(status).json(body);
}

function isCryptoQuestion(question) {
  const text = String(question || "").toLowerCase();
  const keywords = [
    "bitcoin", "btc", "crypto", "dca", "rsi", "portfolio", "drawdown",
    "halving", "volatility", "altcoin", "market cycle", "cost basis", "pnl"
  ];
  return keywords.some((keyword) => text.includes(keyword));
}

function buildSystemPrompt() {
  return [
    "You are a Bitcoin and crypto assistant for a DCA portfolio app.",
    "Answer only about Bitcoin, crypto markets, DCA strategy, portfolio interpretation, and app-related crypto guidance.",
    "If the question is outside scope, respond with category out_of_scope.",
    "Do not guarantee profits.",
    "Do not claim certainty about future prices.",
    "Be concise, practical, and clear.",
    "Return valid JSON only."
  ].join(" ");
}

function buildUserPrompt(question, context) {
  return JSON.stringify({
    question,
    context
  });
}

function normalizeResult(result) {
  return {
    answer: String(result.answer || ""),
    category: ALLOWED_CATEGORIES.includes(result.category) ? result.category : "education",
    confidence: Number(result.confidence || 0),
    scope: "bitcoin_crypto_only",
    followups: Array.isArray(result.followups) ? result.followups.slice(0, 4).map(String) : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.slice(0, 3).map(String) : []
  };
}

function outOfScopeResponse() {
  return {
    answer: "I only answer questions about Bitcoin, crypto, DCA, and your portfolio context.",
    category: "out_of_scope",
    confidence: 100,
    scope: "bitcoin_crypto_only",
    followups: [
      "Explain my current portfolio risk",
      "Should I continue DCA this week?",
      "What does RSI mean right now?"
    ],
    warnings: []
  };
}

async function callOpenAI(question, context) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in Vercel environment variables.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(question, context) }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ask_bitcoin_ai",
          schema: RESPONSE_SCHEMA
        }
      },
      temperature: 0.3
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI request failed.");
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No model output returned.");
  }

  return normalizeResult(JSON.parse(content));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(res);
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { success: false, error: "Method not allowed." });
    return;
  }

  try {
    const { question, context } = req.body || {};
    if (!question || typeof question !== "string") {
      throw new Error("Question is required.");
    }

    if (!isCryptoQuestion(question)) {
      json(res, 200, { success: true, data: outOfScopeResponse() });
      return;
    }

    const result = await callOpenAI(question, context || {});
    json(res, 200, { success: true, data: result });
  } catch (error) {
    json(res, 500, { success: false, error: error.message });
  }
}
