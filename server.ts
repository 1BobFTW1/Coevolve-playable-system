import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// ----------------------------------------------------------------------
// Ollama (local LLM) configuration
// ----------------------------------------------------------------------
const OLLAMA_HOST = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

console.log(`Ollama configured: model="${OLLAMA_MODEL}" host="${OLLAMA_HOST}"`);

/**
 * Calls the local Ollama chat endpoint in JSON mode and returns the parsed object.
 * Throws on any network error, non-OK status, or JSON parse failure — there is no
 * offline fallback; the app works only through the generative model.
 */
async function callOllama(systemInstruction: string, prompt: string, temperature: number): Promise<any> {
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format: "json",
      options: { temperature },
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ollama returned HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Ollama response missing message.content");
  }

  return JSON.parse(content.trim());
}

/**
 * Plain-text chat against Ollama (no JSON mode). Accepts a full message history so
 * it can drive a multi-turn "workshop discussion". Throws on any failure.
 */
async function callOllamaChat(messages: { role: string; content: string }[], temperature: number, json = false): Promise<string> {
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, stream: false, options: { temperature }, messages, ...(json ? { format: "json" } : {}) })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ollama returned HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Ollama response missing message.content");
  }
  return content.trim();
}

/**
 * Builds an optional prompt block that injects human/workshop input (either pasted
 * real workshop notes or a transcript of an AI workshop discussion) so the structured
 * generation incorporates it instead of inventing everything from scratch.
 */
function workshopBlock(workshopNotes?: string): string {
  if (!workshopNotes || !workshopNotes.trim()) return "";
  return `\n\nIMPORTANT — incorporate these human workshop inputs/decisions. Treat them as ground truth and build directly on them (structure and refine them, do not contradict or ignore them):\n"""\n${workshopNotes.trim()}\n"""`;
}

// ----------------------------------------------------------------------
// API Routes
// ----------------------------------------------------------------------

// 1. GENERATE LANDSCAPE
// Generates 3 Opportunities, 3 Solutions, 3 Uncertainties based on Problem Frame
app.post("/api/landscape/generate", async (req, res) => {
  const { problemFrame } = req.body;

  if (!problemFrame) {
    return res.status(400).json({ error: "problemFrame is required." });
  }

  try {
    const systemInstruction = `You are a world-class Service Design Coach and Game Master.
Your job is to read a user's current design "Problem Frame" (which defines the core friction under examination) and generate a live design landscape consisting of 3 distinct cards in 3 categories:
1. "Opportunity Areas": Framing areas that describe high-level angles for design intervention.
2. "Solution Families": Actionable, concrete ideas or concepts addressing these opportunities.
3. "Uncertainty Fields": Critical real-world assumptions, questions, or critical risks that need testing.

Follow these strict rules:
- Provide EXACTLY 3 cards for each category.
- Keep titles extremely tight, catchy, and elegant (max 4-5 words).
- Keep descriptions concise, informative, and visually scannable (max 20 words per card).
- Include an "extraLabel" for each card (e.g., tags, seed names, or crucial indicators, max 3 words).
- Do not use generic consulting jargon; make the generated cards highly tailored, evocative, and customized to the provided Problem Frame.
- Respond with a valid JSON object matching this schema EXACTLY:
{
  "opportunities": [
    { "title": "Opportunity Title 1", "description": "Opportunity Description 1", "extraLabel": "Category/Impact Tags" },
    { "title": "Opportunity Title 2", "description": "Opportunity Description 2", "extraLabel": "Category/Impact Tags" },
    { "title": "Opportunity Title 3", "description": "Opportunity Description 3", "extraLabel": "Category/Impact Tags" }
  ],
  "solutions": [
    { "title": "Solution Title 1", "description": "Solution Description 1", "extraLabel": "Concept Seed Keyword" },
    { "title": "Solution Title 2", "description": "Solution Description 2", "extraLabel": "Concept Seed Keyword" },
    { "title": "Solution Title 3", "description": "Solution Description 3", "extraLabel": "Concept Seed Keyword" }
  ],
  "uncertainties": [
    { "title": "Uncertainty Title 1", "description": "Uncertainty Description 1", "extraLabel": "Crucial Question" },
    { "title": "Uncertainty Title 2", "description": "Uncertainty Description 2", "extraLabel": "Crucial Question" },
    { "title": "Uncertainty Title 3", "description": "Uncertainty Description 3", "extraLabel": "Crucial Question" }
  ]
}`;

    const prompt = `Current Problem Frame: "${problemFrame}"`;

    const parsed = await callOllama(systemInstruction, prompt, 0.8);

    // Add unique IDs and initialize rating default fields
    const mapCards = (list: any[], type: "opportunity" | "solution" | "uncertainty") => {
      return list.map((item, idx) => ({
        id: `${type}-gen-${Date.now()}-${idx}`,
        type,
        title: item.title,
        description: item.description,
        extraLabel: item.extraLabel,
        rating: "low" as const
      }));
    };

    const result = {
      opportunities: mapCards(parsed.opportunities || [], "opportunity"),
      solutions: mapCards(parsed.solutions || [], "solution"),
      uncertainties: mapCards(parsed.uncertainties || [], "uncertainty")
    };

    return res.json(result);
  } catch (err) {
    console.error("Generate landscape error: ", err);
    return res.status(502).json({ error: "Model generation failed", detail: String(err) });
  }
});

// 2. SYNTHESIZE PROBE FAMILY
// Merges Selected Opportunity, Solution, and Uncertainty into a single rich Probe Family + Seed
app.post("/api/landscape/synthesize-probe", async (req, res) => {
  const { problemFrame, opportunity, solution, uncertainty } = req.body;

  if (!opportunity || !solution || !uncertainty) {
    return res.status(400).json({ error: "Selected Opportunity, Solution, and Uncertainty cards are required." });
  }

  try {
    const systemInstruction = `You are an expert Service Design Coach operating a game called "The Landscape".
Your job is to read three curated design components chosen by a human curator:
1. Selected Opportunity Area
2. Selected Solution Family
3. Selected Uncertainty Field

You must synthesize them into a single coherent, elegant "Prototype / Probe Family" containing:
- "title": A powerful name for the test prototype (max 6 words).
- "description": A concise background explaining the test setup: how this solution validates the uncertainty within the opportunity space (1-2 sentences, max 30 words).
- "seed": A highly actionable, simple experimental test idea/directive (the 'Probe Seed') that players or teams could easily deploy inside 24 hours to gather quick feedback (1 sentence, max 20 words).

Keep the wording professional, punchy, and modern. Avoid cliché marketing pitches.
Return valid JSON matching this schema:
{
  "title": "Memorable Probe Family Title",
  "description": "Short explanation of the probe methodology and boundaries.",
  "seed": "Highly concrete actionable test idea/seed."
}`;

      const prompt = `Context:
Problem Frame: "${problemFrame}"
Selected Opportunity: "${opportunity.title}" - ${opportunity.description}
Selected Solution: "${solution.title}" - ${solution.description}
Selected Uncertainty: "${uncertainty.title}" - ${uncertainty.description}`;

    const parsed = await callOllama(systemInstruction, prompt, 0.8);
    return res.json(parsed);
  } catch (err) {
    console.error("Synthesize probe error: ", err);
    return res.status(502).json({ error: "Model generation failed", detail: String(err) });
  }
});

// 3. RUN & HARVEST PROBES
// Generates 2-3 plausible finding logs representing new Evidence
app.post("/api/landscape/harvest", async (req, res) => {
  const { problemFrame, probeTitle, probeDescription, probeSeed, workshopNotes } = req.body;

  if (!probeTitle) {
    return res.status(400).json({ error: "probeTitle is required." });
  }

  try {
    const systemInstruction = `You are a world-class Qualitative Design Researcher.
The players have run a test probe in the real world:
Probe Title: "${probeTitle}"
Probe Description: "${probeDescription}"
Probe Seed Action: "${probeSeed}"

Generate exactly 2 or 3 highly plausible, detailed "Findings" (representing qualitative feedback or evidence).
One finding should represent a positive/promising signal, and one should uncover a critical new bottleneck, unexpected friction, or surprising behavioral turn.

Keep titles short and pithy (max 5 words) and descriptions detailed but brief (1-2 sentences).
Respond with a valid JSON matching this schema EXACTLY:
{
  "findings": [
    { "title": "Short descriptive title 1", "description": "Qualitative feedback description 1" },
    { "title": "Short descriptive title 2", "description": "Qualitative feedback description 2" },
    { "title": "Short descriptive title 3", "description": "Qualitative feedback description 3 (Optional)" }
  ]
}`;

      const prompt = `Problem Frame context: "${problemFrame}"
Probe Actioned: "${probeTitle}" with seed: "${probeSeed}"${workshopBlock(workshopNotes)}`;

    const parsed = await callOllama(systemInstruction, prompt, 0.85);
    // Standardize IDs
    const findingsWithIds = (parsed.findings || []).map((item: any, idx: number) => ({
      id: `finding-${Date.now()}-${idx}`,
      title: item.title,
      description: item.description
    }));
    return res.json({ findings: findingsWithIds });
  } catch (err) {
    console.error("Harvest error: ", err);
    return res.status(502).json({ error: "Model generation failed", detail: String(err) });
  }
});

// 4. UPDATE LANDSCAPE & REFRAME PROBLEM FRAME (Co-evolution Engine)
// Synthesizes accumulated Evidence into a mutated, updated Problem Frame and logs drift delta
app.post("/api/landscape/reframe-problem", async (req, res) => {
  const { initialProblemFrame, currentProblemFrame, newEvidenceFindings, selectedOpportunity, selectedSolution, selectedUncertainty } = req.body;

  if (!newEvidenceFindings || newEvidenceFindings.length === 0) {
    return res.status(400).json({ error: "newEvidenceFindings are required." });
  }

  try {
    const systemInstruction = `You are a legendary Design theorist like Keegan Dorst or Nigel Cross, specializing in co-evolutionary design research.
In co-evolution, every new experimental idea or collected qualitative feedback changes how we understand the problem.
You will look at:
1. The Initial Problem Frame: "${initialProblemFrame}"
2. The Current Problem Frame under examination: "${currentProblemFrame}"
3. The chosen configuration: Opportunity: "${selectedOpportunity?.title || 'None'}", Solution: "${selectedSolution?.title || 'None'}", Uncertainty: "${selectedUncertainty?.title || 'None'}"
4. Newly harvested qualitative findings: ${JSON.stringify(newEvidenceFindings)}

Your job is to REFRAME and MUTATE the Problem Frame. This new frame should incorporate what we just learned from the findings.
- Make the new Problem Frame punchy, thought-provoking, and deeply insightful (e.g. "We previously thought X was about efficiency, but findings reveal it is a query for trust.").
- Max 15 words. Keep it elegant. English language.
- Estimate a semantic "driftScoreDelta" (an integer from 10 to 25 representing how much this shift moves us creatively away from the initial start point).

Respond with valid JSON matching this schema:
{
  "updatedProblemFrame": "New elegant Problem Frame text",
  "driftScoreDelta": 15
}`;

    const prompt = `Update the problem. Let it co-evolve.`;

    const parsed = await callOllama(systemInstruction, prompt, 0.8);
    return res.json({
      updatedProblemFrame: parsed.updatedProblemFrame,
      driftScoreDelta: parsed.driftScoreDelta || Math.floor(Math.random() * 15) + 10
    });
  } catch (err) {
    console.error("Reframe problem error: ", err);
    return res.status(502).json({ error: "Model generation failed", detail: String(err) });
  }
});

// 5. WORKSHOP DISCUSSION (multi-turn chat that simulates a design workshop)
// Given the current step + context + chat history, returns the next assistant reply.
app.post("/api/workshop/discuss", async (req, res) => {
  const { step, context, messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required." });
  }

  const stepFocus: Record<string, string> = {
    landscape: "framing the design landscape: which opportunities, solution families, and key uncertainties matter for this problem.",
    harvest: "interpreting what a real-world test/probe revealed: what findings, signals, and surprising frictions emerged.",
    reframe: "how the new evidence should reframe and mutate the underlying problem statement."
  };

  try {
    const systemInstruction = `You are an experienced design-workshop facilitator running a small, lively workshop with a few colleagues.
The current workshop focus is ${stepFocus[step] || "advancing the design process."}
Context for this session:
"""
${context || "(no extra context provided)"}
"""
Behave like a real facilitator in a discussion:
- Keep "reply" short and conversational (max ~80 words). Offer concrete, opinionated angles; surface tensions and ask one sharp follow-up question to push the thinking.
- Build on what the participant just said. You are co-thinking, not lecturing.
- Also propose "suggestions": 3 short, distinct things the PARTICIPANT could say next (first person, max ~12 words each) — natural answers to your question or new directions. They help an unsure participant keep the conversation going.
Respond with valid JSON matching EXACTLY:
{ "reply": "your facilitator message", "suggestions": ["...", "...", "..."] }`;

    const chatMessages = [
      { role: "system", content: systemInstruction },
      ...messages.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }))
    ];

    const raw = await callOllamaChat(chatMessages, 0.85, true);
    const parsed = JSON.parse(raw);
    return res.json({
      reply: parsed.reply || "",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : []
    });
  } catch (err) {
    console.error("Workshop discuss error: ", err);
    return res.status(502).json({ error: "Model generation failed", detail: String(err) });
  }
});

// 5b. WORKSHOP BRIEF (turn a synthesized probe into a runnable real-world workshop plan)
app.post("/api/workshop/brief", async (req, res) => {
  const { problemFrame, probe, audience } = req.body;

  if (!probe || !probe.title) {
    return res.status(400).json({ error: "probe with a title is required." });
  }

  try {
    const systemInstruction = `You are a seasoned design-research facilitator. Turn a concrete test "probe" into a short, runnable brief for a REAL workshop with real people (not a simulation).
Produce a practical plan a small team could run in about 30 minutes to test the probe and gather honest feedback and fresh ideas.

Rules:
- "objective": one sentence on what this workshop must learn or decide (max 25 words).
- "invite": 3-4 short role descriptions of who to bring (people close to the problem), each max 8 words.
- "agenda": 4-5 timed steps that fit ~30 minutes total; each has "time" (e.g. "0-5 min") and "activity" (max 16 words).
- "capture": 3-4 concrete things to write down/observe during the session, each max 12 words.
- Be specific to THIS probe and audience. Plain, energetic English. No fluff.
- Respond with valid JSON matching EXACTLY:
{
  "objective": "...",
  "invite": ["...", "...", "..."],
  "agenda": [ { "time": "0-5 min", "activity": "..." } ],
  "capture": ["...", "...", "..."]
}`;

    const prompt = `Problem Frame: "${problemFrame || "(none)"}"
Audience / who we design for: ${audience || "(unspecified)"}
Probe title: "${probe.title}"
Probe description: ${probe.description || ""}
Probe seed action: "${probe.seed || ""}"`;

    const parsed = await callOllama(systemInstruction, prompt, 0.7);
    return res.json({
      objective: parsed.objective || "",
      invite: Array.isArray(parsed.invite) ? parsed.invite : [],
      agenda: Array.isArray(parsed.agenda) ? parsed.agenda : [],
      capture: Array.isArray(parsed.capture) ? parsed.capture : []
    });
  } catch (err) {
    console.error("Workshop brief error: ", err);
    return res.status(502).json({ error: "Model generation failed", detail: String(err) });
  }
});

// 6. EXPAND CARD (mindmap fan-out into Pro / Con / Question branches)
app.post("/api/landscape/expand-card", async (req, res) => {
  const { problemFrame, card } = req.body;

  if (!card || !card.title) {
    return res.status(400).json({ error: "card with a title is required." });
  }

  try {
    const systemInstruction = `You are a sharp design strategist. Given one design card, fan it out into exactly three deeper branches that add depth for decision-making:
1. "pro": the strongest reason / upside / what makes this leverage real.
2. "contra": the strongest risk / tension / what could undermine it.
3. "question": the single most important open question to test next.

Rules:
- Each branch: a tight "title" (max 4 words) and a "description" (max 18 words).
- Make them specific to THIS card and the problem frame, not generic.
- Respond with valid JSON matching EXACTLY:
{
  "branches": [
    { "kind": "pro", "title": "...", "description": "..." },
    { "kind": "contra", "title": "...", "description": "..." },
    { "kind": "question", "title": "...", "description": "..." }
  ]
}`;

    const prompt = `Problem Frame: "${problemFrame || "(none)"}"
Card type: ${card.type || "card"}
Card: "${card.title}" — ${card.description || ""}`;

    const parsed = await callOllama(systemInstruction, prompt, 0.8);
    const branches = (parsed.branches || []).map((b: any, idx: number) => ({
      id: `branch-${Date.now()}-${idx}`,
      kind: b.kind || (idx === 0 ? "pro" : idx === 1 ? "contra" : "question"),
      title: b.title,
      description: b.description
    }));
    return res.json({ branches });
  } catch (err) {
    console.error("Expand card error: ", err);
    return res.status(502).json({ error: "Model generation failed", detail: String(err) });
  }
});

// 7. APPLY FACILITATOR DISCUSSION — sort a prep/debrief conversation into
// a recap, brief prep additions, and workshop findings, so each part flows
// to the right place (brief vs. findings) in the UI.
app.post("/api/workshop/apply", async (req, res) => {
  const { context, transcript } = req.body;

  if (!transcript || !String(transcript).trim()) {
    return res.status(400).json({ error: "transcript is required." });
  }

  try {
    const systemInstruction = `You are a design-research facilitator. You are given a conversation someone had while PREPPING or DEBRIEFING a real workshop about a test "probe". Sort what was discussed into three buckets so each part lands in the right place:

- "recap": 1-3 sentences summarizing what this discussion concluded or decided. Plain English.
- "briefAdditions": preparation points — things to do BEFORE or DURING the workshop (setup, who to invite, what to ask, materials, framing). Each a short imperative line (max 14 words). Use [] if none.
- "findings": observations/insights/results that read like they came out of running it (what people did, said, felt, or what surprised them). Each has "title" (short, max 8 words) and "description" (max 25 words). Use [] if none.

Rules:
- Only include a finding if the discussion actually produced an observation or result; do NOT invent findings from pure prep talk.
- Only include briefAdditions that are genuine prep/logistics; do NOT duplicate them as findings.
- If something fits neither, fold it into the recap.
- Plain, specific English. No fluff.
- Respond with valid JSON matching EXACTLY:
{
  "recap": "...",
  "briefAdditions": ["...", "..."],
  "findings": [ { "title": "...", "description": "..." } ]
}`;

    const prompt = `Context:
${context || "(none)"}

Conversation:
${transcript}`;

    const parsed = await callOllama(systemInstruction, prompt, 0.6);
    return res.json({
      recap: parsed.recap || "",
      briefAdditions: Array.isArray(parsed.briefAdditions) ? parsed.briefAdditions.filter((s: any) => typeof s === "string" && s.trim()) : [],
      findings: Array.isArray(parsed.findings)
        ? parsed.findings
            .filter((f: any) => f && (f.title || f.description))
            .map((f: any) => ({ title: String(f.title || "").trim(), description: String(f.description || "").trim() }))
        : []
    });
  } catch (err) {
    console.error("Workshop apply error: ", err);
    return res.status(502).json({ error: "Model generation failed", detail: String(err) });
  }
});

// ----------------------------------------------------------------------
// Vite Middleware & Production Assets Routing
// ----------------------------------------------------------------------
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Vite Server] running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error("Failed to start server:", err);
});
