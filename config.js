/*
  config.js
  ---------
  Central settings file for the Investment Advisor chatbot.
  All Gemini model parameters are defined here so you don't
  have to dig through script.js to change things like temperature
  or token limits. The actual API key is stored securely on the
  server (Vercel environment variable), not here.
*/

const SETTINGS = {

  /* The route our frontend sends requests to.
     In production this hits the /api/chat serverless function on Vercel,
     which then forwards the call to Gemini with the secret API key. */
  PROXY_ENDPOINT: "/api/chat",

  /* Which Gemini model to use.
     gemini-2.0-flash is fast and free-tier friendly — good for a chat app. */
  MODEL_NAME: "gemini-2.0-flash",

  /* Temperature controls how "creative" the response is.
     0.4 means fairly grounded — good for financial advice where
     accuracy matters more than creativity. */
  TEMP: 0.4,

  /* Nucleus sampling threshold.
     0.9 means the model picks from the top 90% of probable words,
     which keeps answers natural without going off-rails. */
  NUCLEUS_P: 0.9,

  /* Limits how many candidate tokens are considered at each step.
     40 is a reasonable middle ground for Q&A-style tasks. */
  TOP_K_VAL: 40,

  /* Maximum tokens the model can output per response.
     512 tokens works out to roughly 350-400 words — enough for a
     detailed portfolio analysis without being overwhelming. */
  MAX_TOKENS: 512,

  /* We only want one answer per request — this is a chat, not a comparison tool. */
  NUM_CANDIDATES: 1,

};
