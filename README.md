# Smart Investment Diversification Guide 🚀

An AI-powered chatbot for portfolio analysis and investment diversification strategies, built with **Google Gemini AI** and deployed on **Vercel**.

## Live Demo

> 🔗 Add your Vercel URL here after deployment

## Features

- 💬 Real-time portfolio analysis via Google Gemini 2.0 Flash
- 📊 4-part structured response: Allocation Summary → Risk Analysis → Strategy → Action Steps
- 🛡️ Topic guardian: only answers investment-related questions
- ✂️ Markdown-free plain-text responses
- 🔒 API key secured server-side via Vercel Serverless Function
- 📱 Responsive minimalist light-theme UI
- ⚡ 4 quick-prompt chips for common portfolio scenarios

## Architecture

```
Browser (static HTML/CSS/JS)
      │
      │  POST /api/chat  (same-origin, no key exposed)
      ▼
Vercel Edge Function  (api/chat.js)
      │  reads GEMINI_API_KEY from env variables
      │  forwards request to Gemini REST API
      ▼
Google Gemini 2.0 Flash API
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | Vanilla CSS (light theme, rounded bubbles) |
| Logic | Vanilla JavaScript ES6+ |
| AI | Google Gemini 2.0 Flash |
| API Security | Vercel Serverless Edge Function |
| Hosting | Vercel (free tier) |

## File Structure

```
smart-investment-guide/
├── index.html         # UI layout
├── style.css          # Light-theme minimalist styling
├── script.js          # Chatbot logic (calls /api/chat)
├── config.js          # Generation parameters (no API key)
├── api/
│   └── chat.js        # Vercel serverless proxy (holds API key)
├── vercel.json        # Vercel deployment config
├── .env.example       # Template for environment variables
├── .gitignore         # Excludes .env, node_modules, etc.
└── README.md          # This file
```

---

## Setup & Deployment

### Step 1 — Get a Gemini API Key

1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy the key — you'll need it in Step 4

---

### Step 2 — Push to GitHub

1. Create a new repository on [github.com](https://github.com/new)
   - Name: `smart-investment-guide`
   - Visibility: **Public** or Private
   - Do NOT initialize with README (we already have one)

2. Copy the repository URL (e.g. `https://github.com/YOUR_USERNAME/smart-investment-guide.git`)

3. Run these commands in your project folder:

```bash
git remote add origin https://github.com/YOUR_USERNAME/smart-investment-guide.git
git branch -M main
git push -u origin main
```

---

### Step 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (use GitHub login for easiest setup)
2. Click **Add New → Project**
3. Click **Import** next to your `smart-investment-guide` repository
4. Leave all build settings as default (Framework Preset: **Other**)
5. **DO NOT deploy yet** — add the environment variable first (Step 4)

---

### Step 4 — Add Environment Variable in Vercel

1. In the Vercel import screen, expand **Environment Variables**
2. Add the following:

   | Name | Value |
   |------|-------|
   | `GEMINI_API_KEY` | `your-actual-gemini-api-key` |

3. Click **Deploy**
4. Wait ~30 seconds for deployment to complete
5. Click the generated URL (e.g. `https://smart-investment-guide.vercel.app`)

---

### Step 5 — Test the Live Chatbot

Open your Vercel URL and test these scenarios:

**✅ In-domain (should give portfolio advice):**
> "I have 70% stocks and 30% FD. How should I diversify?"

**✅ Off-domain (should reject politely):**
> "Who won the cricket World Cup?"

Expected rejection: *"I am not answerable to these questions. Please ask about Smart Investment Diversification."*

---

## Local Development

To run locally with the API key:

1. Copy `.env.example` to `.env`:
   ```
   GEMINI_API_KEY=your_gemini_key_here
   ```

2. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

3. Run dev server (reads `.env` automatically):
   ```bash
   vercel dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

> **Note:** `vercel dev` is required locally because the `/api/chat` serverless function needs the Vercel runtime. A plain file:// or simple HTTP server won't be able to run the API function.

---

## API Parameters (config.js)

| Parameter | Value | Effect |
|-----------|-------|--------|
| `TEMPERATURE` | `0.4` | Factual, consistent advice |
| `TOP_P` | `0.9` | Balanced nucleus sampling |
| `TOP_K` | `40` | Limits token pool per step |
| `MAX_OUTPUT_TOKENS` | `512` | ≈350–400 word cap |
| `CANDIDATE_COUNT` | `1` | One response per call |

---

## Disclaimer

This application provides **educational information only**. Always consult a certified financial advisor before making investment decisions.

---

Made with ❤️ using Google Gemini AI · Deployed on Vercel
