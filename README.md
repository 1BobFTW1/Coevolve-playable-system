# Coevolve — A Co-Evolutionary Design Field

An interactive co-evolutionary design simulation. You start from a **Problem Frame**,
generate a landscape of Opportunities / Solutions / Uncertainties, synthesize a probe,
harvest findings, and let the problem frame mutate over loops.

All generative content is produced by a **local LLM via [Ollama](https://ollama.com)** —
there is no offline/fallback content, so a running Ollama instance is required.

## Run Locally

**Prerequisites:** [Node.js](https://nodejs.org) and [Ollama](https://ollama.com).

1. **Start Ollama** (the desktop app, or `ollama serve` in a terminal).
2. **Pull the model:**
   ```
   ollama pull qwen2.5:7b
   ```
3. **Install dependencies:**
   ```
   npm install
   ```
4. *(Optional)* copy `.env.example` to `.env` to point at a different host or model:
   ```
   OLLAMA_HOST="http://localhost:11434"
   OLLAMA_MODEL="qwen2.5:7b"
   ```
5. **Run the app:**
   ```
   npm run dev
   ```
   Then open http://localhost:3000.

## Configuration

| Variable       | Default                  | Description                          |
| -------------- | ------------------------ | ------------------------------------ |
| `OLLAMA_HOST`  | `http://localhost:11434` | Base URL of the Ollama server.       |
| `OLLAMA_MODEL` | `qwen2.5:7b`             | Any model you've pulled into Ollama. |

> The app requires Ollama to be reachable. If it is down or the model isn't pulled,
> the in-game actions report an error (no canned content is served). The first
> generation may be slow while the model loads into memory.

## Production build

```
npm run build   # vite build + bundle the server
npm start       # serve the built app
```
