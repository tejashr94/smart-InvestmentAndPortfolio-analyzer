/*
  script.js
  ---------
  Main logic for the Investment Diversification chatbot.

  What this file does:
    1. Reads the user's portfolio description from the chat box.
    2. Runs a quick keyword check — if the topic isn't related to
       investing, we reject it instantly without wasting an API call.
    3. Sends qualifying messages to our /api/chat backend route,
       which forwards them securely to Google Gemini.
    4. Strips any markdown formatting from the AI's reply so it
       displays as clean plain text.
    5. Persists the conversation in sessionStorage so it survives
       a page refresh (but clears when the tab is closed).
    6. Supports English and Hindi via a toggle in the header.
*/

"use strict";

/* ==============================================================
   GRAB DOM ELEMENTS
   Caching these once up-front avoids repeated querySelector
   calls every time a message is sent.
   ============================================================== */
const msgFeed       = document.getElementById("chatMessages");
const inputBox      = document.getElementById("userInput");
const submitBtn     = document.getElementById("sendBtn");
const thinkingBar   = document.getElementById("typingIndicator");
const letterCount   = document.getElementById("charCount");
const statusCircle  = document.getElementById("statusDot");
const statusLabel   = document.getElementById("statusText");

/* ==============================================================
   SESSION MEMORY
   We store the chat history in sessionStorage so the conversation
   survives a page reload. When the user closes the tab the browser
   automatically wipes sessionStorage — no stale data.
   ============================================================== */
const HISTORY_KEY = "invest_advisor_history";
const LANG_KEY    = "invest_advisor_lang";

const chatHistory = [];   /* runtime array, pushed to before every API call */

function persistHistory() {
  /* Try to save — silently skip if storage quota is exceeded */
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
  } catch (_) {}
}

function restoreHistory() {
  /* Pull back whatever was saved in a previous page load */
  try {
    const data = sessionStorage.getItem(HISTORY_KEY);
    if (data) {
      const arr = JSON.parse(data);
      if (Array.isArray(arr) && arr.length > 0) {
        chatHistory.push(...arr);
        return true;   /* signals that we have a session to replay */
      }
    }
  } catch (_) {}
  return false;
}

function resetChat() {
  /* Wipe history array, clear storage, empty the feed, show fresh greeting */
  chatHistory.length = 0;
  sessionStorage.removeItem(HISTORY_KEY);
  msgFeed.innerHTML = "";
  showGreeting();
}

/* ==============================================================
   LANGUAGE SUPPORT (ENGLISH / HINDI)
   The active language is remembered between page loads.
   Switching language injects a language-rule instruction into the
   Gemini system prompt so the model responds in the right language.
   ============================================================== */
let activeLang = sessionStorage.getItem(LANG_KEY) || "en";

/* All strings that need to change when language switches */
const LANG_STRINGS = {
  en: {
    inputHint:   "e.g. I have 60% stocks, 30% FD, 10% gold — how should I diversify?",
    rejected:    "📊 I can only help with Smart Investment & Diversification topics. Please ask me about your portfolio, asset allocation, stocks, bonds, mutual funds, or any investment-related query!",
    clearLabel:  "Clear Session",
    langBtnText: "हिं",          /* shows the language to switch TO */
    botName:     "Advisor",
    userName:    "You",
    /* tells Gemini which language to respond in */
    responseRule: "Always respond in clear, simple English regardless of the user's input language.",
    /* message shown in chat after switching */
    switchNotice: "Language switched to English. You can now ask questions in English.",
    sessionNote:  "Previous session restored.",
  },
  hi: {
    inputHint:   "उदा. मेरे पास 60% शेयर, 30% FD, 10% सोना है — मुझे कैसे diversify करना चाहिए?",
    rejected:    "📊 मैं केवल Smart Investment और Diversification से जुड़े प्रश्नों का उत्तर दे सकता हूँ। कृपया अपने portfolio, asset allocation, stocks, bonds, mutual funds या किसी निवेश से संबंधित प्रश्न पूछें!",
    clearLabel:  "सत्र साफ करें",
    langBtnText: "EN",
    botName:     "सलाहकार",
    userName:    "आप",
    responseRule: "Always respond entirely in Hindi using Devanagari script. Keep well-known financial terms in English (equity, SIP, ETF, REIT) but explain them in Hindi.",
    switchNotice: "भाषा हिंदी में बदल दी गई है। अब आप हिंदी में प्रश्न पूछ सकते हैं।",
    sessionNote:  "पिछला सत्र पुनः लोड किया गया।",
  },
};

/* Shorthand to get the current language strings */
const lang = () => LANG_STRINGS[activeLang];

function swapLanguage() {
  /* Flip between en and hi, save the choice, refresh the UI labels */
  activeLang = activeLang === "en" ? "hi" : "en";
  sessionStorage.setItem(LANG_KEY, activeLang);
  refreshLangUI();
  addBubble("bot", lang().switchNotice);
}

function refreshLangUI() {
  /* Update placeholder text and header button label when language changes */
  inputBox.placeholder = lang().inputHint;
  const toggleBtn = document.getElementById("langToggle");
  if (toggleBtn) toggleBtn.textContent = lang().langBtnText;
  const clrBtn = document.getElementById("clearBtn");
  if (clrBtn) clrBtn.title = lang().clearLabel;
}

/* ==============================================================
   GEMINI SYSTEM PROMPT
   This is the instruction we send to Gemini before every
   conversation. It defines exactly what the AI is allowed to
   talk about and forces a structured 4-part answer format for
   any portfolio query. Language rule is appended freshly so
   switching language mid-chat takes effect immediately.
   ============================================================== */
const ADVISOR_PROMPT = `COMMAND: You are an Investment AI. Follow these rules EXACTLY:
1. START directly with "Part 1 - Current Allocation Summary:" — no intro, no "Certainly", no preamble.
2. Structure your response in exactly 4 parts separated by a blank line:
   Part 1 - Current Allocation Summary
   Part 2 - Key Risks
   Part 3 - Suggested Diversification Framework
   Part 4 - Implementation and Monitoring
3. Under EACH part, list EVERY point as a separate bullet using "• " (bullet symbol) at the start of the line.
4. Each bullet point must be on its OWN line. Do NOT run multiple points together in one line.
5. Use NO markdown: no stars (*), no hashes (#), no underscores, no bold.
6. End with EXACTLY this line on its own:
Note: This is educational information only. Please consult a certified financial advisor before making investment decisions.`;

function buildPromptWithLang() {
  /* Attach the language instruction on each API call so it's always current */
  return ADVISOR_PROMPT + "\n\nLANGUAGE INSTRUCTION: " + lang().responseRule;
}

/* ==============================================================
   TOPIC FILTER (DOMAIN GUARD)
   Before making any API call, we scan the user's message for
   investment-related keywords. If none are found, we check for
   conversational follow-up phrases (summary, explain above, etc.)
   — these are allowed when a conversation is already in progress.
   Truly off-topic questions receive an instant rejection.
   ============================================================== */
const TOPIC_KEYWORDS = [
  /* Core investing terms */
  "invest", "portfolio", "stock", "bond", "etf", "fund", "mutual fund",
  "asset", "allocat", "diversif", "rebalanc", "equity", "dividend",
  /* Asset types */
  "real estate", "reit", "commodity", "commodities", "gold", "silver",
  "crypto", "bitcoin", "index fund", "fixed deposit", "fd", "ppf",
  "nps", "sip", "elss", "nifty", "sensex", "large cap", "mid cap",
  "small cap", "debt fund", "liquid fund", "hybrid fund", "bluechip",
  /* Risk and strategy words */
  "risk", "return", "volatility", "hedge", "rebalance", "correlation",
  "concentration", "exposure", "weightage", "holding", "sector",
  "market", "bear", "bull", "inflation", "recession",
  /* Financial metrics */
  "yield", "interest rate", "expense ratio", "nav", "cagr", "xirr",
  "capital gain", "tax", "retirement", "401k", "ira", "pension",
  "financial", "finance", "wealth", "saving", "share", "securities",
  /* Geographic context */
  "international", "emerging market", "developed market", "global",
  "domestic", "foreign", "us market", "indian market",
  /* User action phrases */
  "strategy", "strategies", "how to invest", "where to invest",
  "should i invest", "how much", "percentage", "allocation",
  "balance", "beginner", "advanced", "suggest", "recommend",
  "analyze", "analysis", "review my", "look at my",
  /* Natural ways someone might describe their portfolio */
  "i have", "i hold", "my portfolio", "i own", "i put", "i invested",
  "i am investing", "i want to invest", "currently invested",
];

/*
  Follow-up phrases: short conversational requests that refer back
  to what the AI just said. These should always be allowed when the
  user already has an ongoing investment conversation (chatHistory
  has at least one AI reply). Examples:
    "explain in brief", "summarize the above", "tell me more",
    "what does part 2 mean?", "can you simplify?", etc.
*/
const FOLLOWUP_KEYWORDS = [
  /* Summary / brevity requests */
  "summar", "in short", "in brief", "briefly", "short summary",
  "give me a summary", "quick summary", "tldr", "tl;dr",
  /* Elaboration / clarification requests */
  "explain", "elaborate", "clarify", "simplify", "expand",
  "tell me more", "more detail", "in detail", "what do you mean",
  "can you explain", "could you explain", "please explain",
  /* Reference to previous answer */
  "the above", "above answer", "your answer", "the answer",
  "what you said", "previous", "last response", "that response",
  "part 1", "part 2", "part 3", "part 4",
  /* Generic follow-ups */
  "what does", "what is", "how does", "why is", "why does",
  "ok", "okay", "got it", "understood", "continue", "go on",
  "and", "also", "what about", "how about", "any more",
  /* Hindi follow-up equivalents */
  "संक्षेप", "संछेप", "बताइए", "समझाइए", "विस्तार", "ऊपर",
];

function isOnTopic(userText) {
  const lower = userText.toLowerCase().trim();

  /* 1. Direct match on investment keywords — always pass */
  if (TOPIC_KEYWORDS.some(kw => lower.includes(kw))) return true;

  /* 2. Follow-up match — only pass if the AI has already replied
        (i.e., there is at least one "model" entry in history).    */
  const hasConversation = chatHistory.some(e => e.role === "model");
  if (hasConversation && FOLLOWUP_KEYWORDS.some(kw => lower.includes(kw))) return true;

  /* 3. Very short messages (≤ 6 words) during an active conversation
        are almost always follow-ups ("ok", "and?", "why?") — let them through */
  if (hasConversation && lower.split(/\s+/).length <= 6) return true;

  return false;
}

/* ==============================================================
   MARKDOWN CLEANER
   Even though we tell Gemini not to use markdown, it sometimes
   sneaks in asterisks or hashes. This function strips them all
   out before displaying the response so the UI stays clean.
   ============================================================== */
function cleanResponse(rawText) {
  return rawText
    .replace(/```[\s\S]*?```/g, "")       /* remove code fences */
    .replace(/^#{1,6}\s+/gm, "")          /* remove markdown headings */
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1") /* strip bold/italic but keep text */
    .replace(/\*{1,3}/g, "")              /* strip remaining lone asterisks */
    .replace(/_{1,3}/g, "")               /* strip underscores */
    .replace(/`+/g, "")                   /* strip backticks */
    .replace(/^>\s+/gm, "")              /* strip blockquotes */
    /* Normalise AI bullet markers (-, *, +, numbers like "1.") to our bullet symbol */
    .replace(/^[ \t]*(?:\d+\.\s+|[-*+]\s+)/gm, "• ")
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "") /* remove horizontal rules */
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  /* strip links, keep text */
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")      /* strip images */
    .replace(/\n{3,}/g, "\n\n")           /* collapse excess blank lines */
    .trim();
}

/* ==============================================================
   TIMESTAMP HELPER
   Used to show "10:34 AM" style time below each bubble.
   ============================================================== */
function currentTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/* ==============================================================
   ADD BUBBLE
   Creates and appends a chat bubble to the message feed.
   role: "user" OR "bot"
   isErr: true turns the bubble red for error messages
   ============================================================== */
/**
 * Safely converts a plain-text AI response into structured HTML.
 * Rules:
 *   • Lines starting with "Part N" become bold section headers.
 *   • Lines starting with "• " become <li> items inside a <ul>.
 *   • Blank lines close any open list and insert a visual spacer.
 *   • All other text is wrapped in a <p>.
 *   • Content is escaped before insertion — no XSS risk.
 */
function renderBotText(rawText) {
  const esc = s => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines  = rawText.split("\n");
  let   html   = "";
  let   inList = false;

  lines.forEach(line => {
    const trimmed = line.trim();

    if (trimmed === "") {
      /* blank line — close any open list and add spacing */
      if (inList) { html += "</ul>"; inList = false; }
      html += "<div class='bot-spacer'></div>";
      return;
    }

    /* Section headers: "Part 1 - …" */
    if (/^Part\s+\d+/i.test(trimmed)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p class="bot-section-header">${esc(trimmed)}</p>`;
      return;
    }

    /* Bullet points */
    if (trimmed.startsWith("• ")) {
      if (!inList) { html += "<ul class='bot-list'>"; inList = true; }
      html += `<li>${esc(trimmed.slice(2))}</li>`;
      return;
    }

    /* Note / disclaimer line */
    if (/^Note:/i.test(trimmed)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p class="bot-note">${esc(trimmed)}</p>`;
      return;
    }

    /* Fallback: regular paragraph */
    if (inList) { html += "</ul>"; inList = false; }
    html += `<p>${esc(trimmed)}</p>`;
  });

  if (inList) html += "</ul>";
  return html;
}

function addBubble(role, text, isErr = false) {
  const fromUser = role === "user";

  /* Outer row wrapper */
  const row = document.createElement("div");
  row.className = `chat-msg ${fromUser ? "user-msg" : "bot-msg"}`;

  /* Small circular avatar showing "You" or "AI" */
  const avatar = document.createElement("div");
  avatar.className = "avatar-circle";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = fromUser ? lang().userName : "AI";

  /* Column that holds sender name, bubble, and timestamp */
  const col = document.createElement("div");
  col.className = "bubble-wrap";

  const nameTag = document.createElement("span");
  nameTag.className = "sender-name";
  nameTag.textContent = fromUser ? lang().userName : lang().botName;

  /* The actual message bubble */
  const bubble = document.createElement("div");
  bubble.className = `bubble-text${isErr ? " has-error" : ""}`;

  if (fromUser) {
    /* User messages: plain text — never interpret as HTML */
    bubble.textContent = text;
  } else {
    /* Bot messages: render structured bullets and headers */
    bubble.innerHTML = renderBotText(text);
  }

  const time = document.createElement("span");
  time.className = "msg-timestamp";
  time.textContent = currentTime();

  col.appendChild(nameTag);
  col.appendChild(bubble);
  col.appendChild(time);
  row.appendChild(avatar);
  row.appendChild(col);

  msgFeed.appendChild(row);
  scrollDown();

  return bubble;
}

function scrollDown() {
  msgFeed.scrollTo({ top: msgFeed.scrollHeight, behavior: "smooth" });
}

/* ==============================================================
   THINKING INDICATOR CONTROLS
   Show/hide the animated dots while waiting for the API.
   ============================================================== */
function showThinking() {
  thinkingBar.classList.remove("hidden");
  scrollDown();
}

function hideThinking() {
  thinkingBar.classList.add("hidden");
}

/* ==============================================================
   STATUS BADGE
   Changes the green "Online" dot to amber "Thinking..." while
   the API request is in flight, then resets when done.
   ============================================================== */
function setStatusBadge(mode) {
  if (mode === "busy") {
    statusCircle.style.background        = "#F59E0B";  /* amber */
    statusLabel.style.color              = "#D97706";
    statusLabel.textContent              = "Thinking…";
    statusCircle.style.animationDuration = "0.5s";     /* faster pulse */
  } else {
    statusCircle.style.background        = "#10B981";  /* green */
    statusLabel.style.color              = "#059669";
    statusLabel.textContent              = "Online";
    statusCircle.style.animationDuration = "2s";
  }
}

/* ==============================================================
   OPENROUTER / AI API REQUEST
   ============================================================== */
async function fetchAIReply(userMessage) {

  /* Build messages array starting with system prompt */
  const messages = [
    { role: "system", content: buildPromptWithLang() }
  ];

  /* Add chat history (mapping Gemini-style roles to OpenAI-style) */
  chatHistory.forEach(entry => {
    messages.push({
      role: entry.role === "model" ? "assistant" : "user",
      content: entry.text
    });
  });

  /* Add current message */
  messages.push({ role: "user", content: userMessage });

  const payload = {
    messages,
    temperature: SETTINGS.TEMP,
    max_tokens: SETTINGS.MAX_TOKENS
  };

  const res = await fetch(SETTINGS.PROXY_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return cleanResponse(data.text || "");
}

/* ==============================================================
   MAIN SEND HANDLER
   Called when the user clicks Send or presses Enter.
   Full flow:
     1. Read and display the user's message
     2. Topic check — reject off-topic questions immediately
     3. Show thinking indicator, call the API
     4. Display the cleaned AI response
   ============================================================== */
async function handleSend() {
  const userText = inputBox.value.trim();
  if (!userText || submitBtn.disabled) return;

  /* Show the user's message in the chat and add it to history */
  addBubble("user", userText);
  chatHistory.push({ role: "user", text: userText });
  persistHistory();   /* save after each message so nothing is lost on refresh */

  /* Clear the input field and disable Send until a response arrives */
  inputBox.value = "";
  resizeInput();
  refreshCharCount();
  submitBtn.disabled = true;

  /* Quick domain check — no need to call the API for off-topic questions */
  if (!isOnTopic(userText)) {
    const rejection = lang().rejected;
    addBubble("bot", rejection);
    chatHistory.push({ role: "model", text: rejection });
    persistHistory();
    submitBtn.disabled = false;
    inputBox.focus();
    return;
  }

  /* Show the animated thinking dots while we wait for Gemini */
  showThinking();
  setStatusBadge("busy");

  try {
    const reply = await fetchAIReply(userText);

    hideThinking();
    setStatusBadge("online");

    /* Add the AI's reply to the chat and save it to session */
    addBubble("bot", reply);
    chatHistory.push({ role: "model", text: reply });
    persistHistory();

    /* Cap history at 20 entries (10 pairs) to avoid the payload growing too large */
    if (chatHistory.length > 20) {
      chatHistory.splice(0, 2);
      persistHistory();
    }

  } catch (err) {
    hideThinking();
    setStatusBadge("online");
    console.error("API error:", err);
    addBubble("bot", `Error: ${err.message}. Check your API key and try again.`, true);
  } finally {
    submitBtn.disabled = false;
    inputBox.focus();
  }
}

/* ==============================================================
   TEXTAREA RESIZE
   Auto-expands the textarea as the user types, up to a max height.
   Feels much more natural than a fixed-height input for longer text.
   ============================================================== */
function resizeInput() {
  inputBox.style.height = "auto";
  inputBox.style.height = Math.min(inputBox.scrollHeight, 130) + "px";
}

/* Updates the "84 / 2000" character counter, turns amber near the limit */
function refreshCharCount() {
  const n = inputBox.value.length;
  letterCount.textContent = `${n} / 2000`;
  letterCount.style.color = n > 1800 ? "#F59E0B" : "";
}

/* ==============================================================
   INPUT EVENT LISTENERS
   Keep the textarea, character counter, and send button in sync.
   ============================================================== */
inputBox.addEventListener("input", () => {
  resizeInput();
  refreshCharCount();
  /* Only enable Send if there's actual content */
  submitBtn.disabled = inputBox.value.trim().length === 0;
});

inputBox.addEventListener("keydown", e => {
  /* Enter alone sends; Shift+Enter creates a new line */
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

submitBtn.addEventListener("click", handleSend);

/* ==============================================================
   CHIP PREFILL
   When the user clicks one of the scenario chip buttons in the HTML,
   this fills the textarea with a ready-to-send portfolio question.
   ============================================================== */
function prefillInput(scenarioText) {
  inputBox.value = scenarioText;
  resizeInput();
  refreshCharCount();
  submitBtn.disabled = false;
  inputBox.focus();
}

/* ==============================================================
   GREETING MESSAGE
   Shown on first load or after clearing the chat.
   Written as a DOM manipulation rather than innerHTML to keep
   things safe and consistent with the rest of the bubbles.
   ============================================================== */
function showGreeting() {
  const row = document.createElement("div");
  row.className = "chat-msg bot-msg welcome-msg";

  const avatar = document.createElement("div");
  avatar.className = "avatar-circle";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = "AI";

  const col = document.createElement("div");
  col.className = "bubble-wrap";

  const nameTag = document.createElement("span");
  nameTag.className = "sender-name";
  nameTag.textContent = lang().botName;

  const bubble = document.createElement("div");
  bubble.className = "bubble-text";
  /* Introductory message explains what the chatbot can do */
  bubble.textContent =
    "Hello! I am your Smart Investment Diversification Advisor. " +
    "Share your current portfolio and I will analyse it for you. " +
    "Try something like: 'I have 70% in stocks and 30% in fixed deposits — " +
    "how should I diversify?' " +
    "I can spot concentration risks, suggest allocations across equity, debt, " +
    "real estate, and gold, and give you specific action steps. " +
    "You can also ask general questions about rebalancing, asset classes, " +
    "or diversification strategies.";

  const time = document.createElement("span");
  time.className = "msg-timestamp";
  time.textContent = currentTime();

  col.appendChild(nameTag);
  col.appendChild(bubble);
  col.appendChild(time);
  row.appendChild(avatar);
  row.appendChild(col);

  msgFeed.appendChild(row);
}

/* ==============================================================
   STARTUP
   1. Apply the saved language preference to the UI.
   2. Try to restore a previous session from sessionStorage.
   3. If a session exists, replay the bubbles and show a notice.
   4. Otherwise just show the fresh greeting message.
   ============================================================== */
refreshLangUI();

const sessionFound = restoreHistory();

if (sessionFound) {
  /* Replay each saved message so the user sees their previous chat */
  chatHistory.forEach(entry => {
    const role = entry.role === "model" ? "bot" : "user";
    addBubble(role, entry.text);
  });

  /* Small pill notice at the bottom letting them know it was restored */
  const notice = document.createElement("p");
  notice.className = "session-banner";
  notice.textContent = lang().sessionNote;
  msgFeed.appendChild(notice);
  scrollDown();
} else {
  showGreeting();
}

inputBox.focus();
