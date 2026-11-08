# ArticleDNA

**Understand the DNA behind every article.**

ArticleDNA is a Chrome extension that breaks down research papers and articles: their summary,
main argument, evidence, assumptions, limitations and future work. It can also draw a workflow
diagram and a knowledge graph of the paper. Click **Find in page** next to any point to jump to the
passage it's based on.

## Features

- **Research papers:** Abstract, Methodology, Key findings, Research gap, Limitations, Future work
- **Articles:** TL;DR, Key takeaways, Core concepts, Facts, Statistics, Quotes, Sources, Further reading
- **Visualize:** workflow diagram and interactive knowledge graph
- **Saved and History:** stored locally in your browser
- **Several AI providers:** Gemini first, then Groq, OpenRouter or Ollama when it hits its limit

## Setup

### 1. Backend (Python 3.11+)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env        # macOS/Linux: cp .env.example .env
```

Open `backend/.env` and add at least one key:

| Key | Where to get it |
| --- | --- |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `GROQ_API_KEY` (optional) | https://console.groq.com/keys |
| `OPENROUTER_API_KEY` (optional) | https://openrouter.ai/keys |

Start the server and keep the terminal open:

```bash
uvicorn main:app --port 8000
```

### 2. Extension (Node 20+)

```bash
cd extension
npm install
npm run build
```

In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose
`extension/dist`.

### 3. Use it

Open an article, click the ArticleDNA icon, then choose **Analyze** or **Visualize**.

## Privacy

Pages are read in your browser. Text is sent to your own backend and the AI provider only when you
click Analyze or Visualize. API keys stay in `backend/.env`, which is never committed.

## Tests

```bash
cd backend && .venv\Scripts\python -m pytest
cd extension && npm test
```
