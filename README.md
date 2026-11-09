<p align="center">
  <img src="brand/logo-lockup.svg" alt="ArticleDNA" height="96">
</p>

<h3 align="center">Understand the DNA behind every article.</h3>

<p align="center">
  A Chrome extension that breaks research papers and articles down into what they claim, the
  evidence behind it, what they assume, and what's still open, and draws them as diagrams.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4D57E6?logo=googlechrome&logoColor=white" alt="Chrome MV3">
  <img src="https://img.shields.io/badge/React-19-090D1A?logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-090D1A?logo=typescript&logoColor=3178C6" alt="TypeScript">
  <img src="https://img.shields.io/badge/FastAPI-090D1A?logo=fastapi&logoColor=009688" alt="FastAPI">
  <img src="https://img.shields.io/badge/Gemini-4D57E6?logo=googlegemini&logoColor=white" alt="Gemini">
</p>

<p align="center">
  <a href="#-demo"><b>Watch the demo</b></a> ·
  <a href="#-features"><b>Features</b></a> ·
  <a href="#-getting-started"><b>Getting started</b></a> ·
  <a href="#-architecture"><b>Architecture</b></a>
</p>

<p align="center">
  <img src="docs/screenshots/in-browser.png" alt="ArticleDNA open next to a research paper" width="900">
</p>

---

## 🎬 Demo

<!-- Replace the link below with your video (YouTube, Loom or a GitHub-hosted .mp4). -->
**Demo video:** coming soon

## ✨ Features

**🧬 Analyze.** A structured breakdown that adapts to what you're reading:

| Research papers | Articles, news & blogs |
| --- | --- |
| Abstract · Methodology · Key findings · Research gap · Limitations · Future work | TL;DR · Key takeaways · Core concepts · Facts · Statistics · Quotes · Sources · Further reading |

Followed by the **Main argument**, **Evidence** (with the kind and strength of support for each
claim) and **Assumptions** (stated by the author or inferred).

**🎯 Find in page.** Every point is written in plain words, with a button that scrolls the paper to
the exact passage it's based on and highlights it. ArticleDNA never highlights a passage that only
looks similar.

**🕸️ Visualize.** A step-by-step **workflow** of the work and an interactive **knowledge graph** of
its concepts and how they connect.

**🛡️ Grounded.** Numbers, quotes and sources are only shown when they appear in the article itself.

**📚 Saved & History.** Bookmark analyses, or reopen anything you've analyzed. Everything stays in
your browser.

**⚡ Always available.** Gemini first, then Groq, OpenRouter or a local Ollama model when it hits its
limit, switched automatically.

## 📸 Screenshots

| Explore | Summary | Workflow | Knowledge graph |
| :---: | :---: | :---: | :---: |
| <img src="docs/screenshots/explore.png" width="200"> | <img src="docs/screenshots/summary.png" width="200"> | <img src="docs/screenshots/workflow.png" width="200"> | <img src="docs/screenshots/knowledge-graph.png" width="200"> |

## 🛠️ Tech stack

| Layer | Tools |
| --- | --- |
| Extension | Chrome Manifest V3 side panel, React 19, TypeScript, Tailwind CSS 4, Vite |
| Page reading | Mozilla Readability, CSS Custom Highlight API |
| Diagrams | d3-force, SVG |
| Backend | Python, FastAPI, Pydantic |
| AI | Google Gemini, with Groq, OpenRouter and Ollama fallbacks |
| Storage | Chrome Storage API (local only) |

## 🏗️ Architecture

```mermaid
flowchart LR
    subgraph Browser["Chrome"]
        Page["Article page"]
        CS["Content script<br/>extract text · highlight passages"]
        Panel["Side panel<br/>React app"]
        Store[("chrome.storage<br/>Saved · History")]
    end
    subgraph Server["ArticleDNA backend (FastAPI)"]
        API["/api/analyze<br/>/api/visualize"]
        Router["Provider router<br/>fallback + cooldowns"]
        Check["Grounding check<br/>quotes · numbers · sources"]
    end
    AI["Gemini → Groq → OpenRouter → Ollama"]

    Page <--> CS
    CS <--> Panel
    Panel <--> Store
    Panel -- "article text (on click)" --> API
    API --> Router --> AI
    AI --> Check --> Panel
```

The page is read in your browser. Text goes to the backend only when you click **Analyze** or
**Visualize**, and API keys never leave the server.

## 🚀 Getting started

**1. Backend** (Python 3.11+)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # macOS/Linux: cp .env.example .env
```

Add at least one key to `backend/.env`:

| Key | Get it from |
| --- | --- |
| `GEMINI_API_KEY` | <https://aistudio.google.com/apikey> |
| `GROQ_API_KEY` (optional fallback) | <https://console.groq.com/keys> |
| `OPENROUTER_API_KEY` (optional fallback) | <https://openrouter.ai/keys> |

Start the server and keep the window open. On Windows, just double-click **`start-backend.bat`**. Or:

```bash
uvicorn main:app --port 8000
```

**2. Extension** (Node 20+)

```bash
cd extension
npm install
npm run build
```

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick
`extension/dist`.

**3. Use it.** Open a paper or article, click the ArticleDNA icon, and choose **Analyze** or
**Visualize**.

## 🧪 Tests

```bash
cd backend   && .venv\Scripts\python -m pytest
cd extension && npm test
```

---

<p align="center">Made with ❤️ by <b>Bharani Sankar</b></p>
