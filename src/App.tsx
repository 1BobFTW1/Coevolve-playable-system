import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  ArrowRight, 
  RotateCcw, 
  HelpCircle, 
  Compass, 
  Check, 
  Copy,
  ChevronRight,
  RefreshCw,
  Layers,
  Grid,
  Shuffle,
  Edit2,
  History,
  Wand2,
  Save,
  X,
  BookOpen,
  TrendingUp,
  Award,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  Play,
  ArrowBigUpDash,
  LogOut,
  Info,
  Sliders,
  Maximize2,
  TrendingDown,
  Activity,
  MapPin,
  Flame,
  FileText,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { gamePresets, GamePreset, emptyPreset } from "./data";
import { LandscapeCard, ProbeFamily, Finding, Evidence, LoopHistory, CardType } from "./types";

interface RetiredWell {
  id: string;
  title: string;
  type: CardType;
  x: number;
  y: number;
  loopIndex: number;
  description: string;
}

// Cycles through themed phrases while `active`, returning the current one. Used for
// the various "thinking" loaders so they rotate copy instead of sitting static.
function useCyclingPhrase(active: boolean, phrases: string[], intervalMs = 6000): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) { setI(0); return; }
    const id = setInterval(() => setI(prev => (prev + 1) % phrases.length), intervalMs);
    return () => clearInterval(id);
  }, [active, phrases.length, intervalMs]);
  return phrases[i] ?? phrases[0] ?? "";
}

export default function App() {
  // Game Setup state (Stage 0)
  const [selectedPreset, setSelectedPreset] = useState<GamePreset>(gamePresets[0]);
  const [customDesigningFor, setCustomDesigningFor] = useState<string>("");
  const [customObservations, setCustomObservations] = useState<string>("");
  const [isGameStarted, setIsGameStarted] = useState<boolean>(false);

  // Core Game States
  const [loopIndex, setLoopIndex] = useState<number>(1);
  const [problemFrame, setProblemFrame] = useState<string>("");
  const [initialProblemFrame, setInitialProblemFrame] = useState<string>("");
  const [reframeDrift, setReframeDrift] = useState<number>(0);
  const [evidenceLog, setEvidenceLog] = useState<Evidence[]>([]);
  const [history, setHistory] = useState<LoopHistory[]>([]);
  const [workshopMode, setWorkshopMode] = useState<boolean>(false);

  // Workshop decision-point overlay (AI discussion / real notes) for landscape/harvest/reframe
  const [workshopStep, setWorkshopStep] = useState<null | "harvest">(null);
  const [workshopTab, setWorkshopTab] = useState<"discuss" | "notes">("discuss");
  const [workshopMessages, setWorkshopMessages] = useState<{ role: string; content: string }[]>([]);
  const [workshopInput, setWorkshopInput] = useState<string>("");
  const [workshopNotes, setWorkshopNotes] = useState<string>("");
  const [workshopBusy, setWorkshopBusy] = useState<boolean>(false);
  const WORKSHOP_STARTER_SUGGESTIONS = [
    "What's the real tension here?",
    "Who might react badly to this?",
    "What would success actually look like?"
  ];
  const [workshopSuggestions, setWorkshopSuggestions] = useState<string[]>(WORKSHOP_STARTER_SUGGESTIONS);

  // Active Landscape Cards
  const [opportunities, setOpportunities] = useState<LandscapeCard[]>([]);
  const [solutions, setSolutions] = useState<LandscapeCard[]>([]);
  const [uncertainties, setUncertainties] = useState<LandscapeCard[]>([]);

  // Selection states
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [selectedSolId, setSelectedSolId] = useState<string | null>(null);
  const [selectedUncId, setSelectedUncId] = useState<string | null>(null);
  const [justifications, setJustifications] = useState<{ [cardId: string]: string }>({});

  // Mindmap fan-out (Pro/Contra/Frage branches) per selected card
  type CardBranch = { id: string; kind: "pro" | "contra" | "question"; title: string; description: string };
  const [cardBranches, setCardBranches] = useState<{ [cardId: string]: CardBranch[] }>({});
  const [branchLoadingCardId, setBranchLoadingCardId] = useState<string | null>(null);
  // Card currently being swapped for a fresh AI-generated alternative
  const [refreshingCardId, setRefreshingCardId] = useState<string | null>(null);

  // API Call Loaders
  const [isGeneratingLandscape, setIsGeneratingLandscape] = useState<boolean>(false);
  const [isSynthesizingProbe, setIsSynthesizingProbe] = useState<boolean>(false);
  const [isHarvesting, setIsHarvesting] = useState<boolean>(false);
  const [isReframing, setIsReframing] = useState<boolean>(false);

  // Stage states
  const [gameStage, setGameStage] = useState<"LANDSCAPE" | "PROBE_CURATION" | "WORKSHOP_LAUNCH" | "RUN_HARVEST" | "REFLECTION">("LANDSCAPE");

  // Probe state (Stage 3 & 4)
  const [probe, setProbe] = useState<ProbeFamily | null>(null);
  const [reshapedSeed, setReshapedSeed] = useState<string>("");
  const [isReshaping, setIsReshaping] = useState<boolean>(false);

  // Workshop launch pad (Probe → real workshop jump-off)
  type WorkshopBrief = { objective: string; invite: string[]; agenda: { time: string; activity: string }[]; capture: string[] };
  const [workshopBrief, setWorkshopBrief] = useState<WorkshopBrief | null>(null);
  const [isLoadingBrief, setIsLoadingBrief] = useState<boolean>(false);
  // Prep points the AI facilitator surfaced — appended to the brief
  const [workshopBriefAdditions, setWorkshopBriefAdditions] = useState<string[]>([]);
  // Recap of the applied facilitator discussion (+ full conversation for copy)
  const [workshopRecap, setWorkshopRecap] = useState<{ summary: string; conversation: string; findingsCount: number } | null>(null);
  const [isApplyingWorkshop, setIsApplyingWorkshop] = useState<boolean>(false);
  const [recapCopied, setRecapCopied] = useState<boolean>(false);
  // Auto-scroll the facilitator chat to the newest message
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Brief FYI shown on the harvest → landscape loop transition
  const [loopTransition, setLoopTransition] = useState<{ loop: number; frame: string; drift: number } | null>(null);

  // Harvest Findings state (Stage 5)
  const [findings, setFindings] = useState<Finding[]>([]);
  const [workshopFindingTexts, setWorkshopFindingTexts] = useState<{ title: string; desc: string }[]>([
    { title: "Empirical Finding A", desc: "Users reacted strongly to the micro-timing and requested persistent progress charts." },
    { title: "Empirical Finding B", desc: "The speed-bump felt intuitive but users triggered bypass filters past 3 attempts." }
  ]);
  // Each telemetry line keeps the timestamp of when it was appended, so the mock
  // times stay sequential instead of re-rendering to the current time on every line.
  const [runLogMessages, setRunLogMessages] = useState<{ time: string; msg: string }[]>([]);
  const [simulationProgress, setSimulationProgress] = useState<number>(0);

  // Message notifications
  const [copied, setCopied] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Wildcard tracker
  const [wildCardCount, setWildCardCount] = useState<number>(0);
  const [wildCardTarget, setWildCardTarget] = useState<CardType>("opportunity");

  // Panoramic Map Navigation State
  const [pan, setPan] = useState({ x: -100, y: -50 });
  const [zoom, setZoom] = useState(0.85);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Spur der Exploration - trail of deactivated old drill wells
  const [retiredWells, setRetiredWells] = useState<RetiredWell[]>([]);
  const [hoveredRetiredWell, setHoveredRetiredWell] = useState<RetiredWell | null>(null);

  // Coordinates on the Map for Layout Slots
  // Drag-to-pan Canvas Event Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only drag on left click
    const target = e.target as HTMLElement;
    if (target.closest("button, select, input, textarea, a")) return; // skip interactive elements
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mobile Touch Drag support
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, select, input, textarea, a")) return;
    setIsDragging(true);
    const touch = e.touches[0];
    setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setPan({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    });
  };

  // ---- Field geometry (canvas wrapper is FIELD_W x FIELD_H, transform-origin center) ----
  const FIELD_W = 1800;
  const FIELD_H = 1300;
  const REGION_R = 300;                 // radius of each area circle
  const HUB = { x: 900, y: 380 };       // central drill zone
  const AREA_CENTERS = {
    opportunity: { x: 350, y: 400 },
    solution: { x: 1450, y: 400 },
    uncertainty: { x: 900, y: 920 }
  };

  // Point on an area's circle edge that faces the central hub (for connection lines)
  const regionEdge = (cx: number, cy: number) => {
    const dx = HUB.x - cx;
    const dy = HUB.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: cx + (dx / len) * REGION_R, y: cy + (dy / len) * REGION_R };
  };

  // Place a retired ("dormant") well of a given area for a given loop. Wells fan out
  // symmetrically around the area's outward direction (away from the hub) and creep
  // slightly further out each loop, so successive loops trace a visible trail on the
  // area's rim instead of stacking on the same pixel.
  const getRetiredWellPosition = (type: CardType, loop: number) => {
    const center = AREA_CENTERS[type];
    const baseAngle = Math.atan2(center.y - HUB.y, center.x - HUB.x); // points outward
    const step = Math.max(0, loop - 1);                               // 0 for loop 1
    const fan = (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * 0.4; // 0, +0.4, -0.4, +0.8…
    const radius = REGION_R + 42 + step * 5;                          // just outside the rim
    return {
      x: center.x + Math.cos(baseAngle + fan) * radius,
      y: center.y + Math.sin(baseAngle + fan) * radius
    };
  };

  // Pan so that field point (fx, fy) lands at the viewport center, at the given zoom.
  // Mapping (origin-center): container = fieldCenter + z*(p - fieldCenter) + pan.
  const centerOn = (fx: number, fy: number, z: number) => {
    const el = document.getElementById("tactile-oilfield-canvas");
    const W = el?.clientWidth || 1200;
    const H = el?.clientHeight || 700;
    const cx = FIELD_W / 2;
    const cy = FIELD_H / 2;
    setZoom(z);
    setPan({ x: W / 2 - cx - z * (fx - cx), y: H / 2 - cy - z * (fy - cy) });
  };

  // Map quick HUD focus jumps — all re-centered on the relevant field point
  const focusOnType = (direction: "opportunities" | "solutions" | "uncertainties" | "center" | "all") => {
    if (direction === "opportunities") {
      centerOn(AREA_CENTERS.opportunity.x, AREA_CENTERS.opportunity.y, 0.9);
    } else if (direction === "solutions") {
      centerOn(AREA_CENTERS.solution.x, AREA_CENTERS.solution.y, 0.9);
    } else if (direction === "uncertainties") {
      centerOn(AREA_CENTERS.uncertainty.x, AREA_CENTERS.uncertainty.y, 0.9);
    } else if (direction === "center") {
      centerOn(HUB.x, HUB.y, 0.95);
    } else if (direction === "all") {
      const el = document.getElementById("tactile-oilfield-canvas");
      const W = el?.clientWidth || 1200;
      const H = el?.clientHeight || 700;
      const z = Math.max(0.3, Math.min(W / FIELD_W, H / FIELD_H) * 0.92);
      centerOn(FIELD_W / 2, FIELD_H / 2, z);
    }
  };

  // Trackpad / Wheel Pan & Zoom Event Listener with Pinch-to-zoom support
  useEffect(() => {
    const canvasElement = document.getElementById("tactile-oilfield-canvas");
    if (!canvasElement) return;

    const handleWheel = (e: WheelEvent) => {
      // Prevent browser default back/forward gestures and vertical scrolling on canvas
      e.preventDefault();

      if (e.ctrlKey) {
        // Trackpad pinch-to-zoom OR Ctrl + Mouse Wheel zoom
        // e.deltaY is negative when pinching in, positive when pinching out
        const scaleFactor = 1.05;
        setZoom(prev => {
          const next = e.deltaY < 0 ? prev * scaleFactor : prev / scaleFactor;
          return Math.max(0.4, Math.min(1.5, next));
        });
      } else {
        // Trackpad 2-finger panning OR standard mouse wheel scrolling
        setPan(prev => ({
          x: prev.x - e.deltaX * 1.1,
          y: prev.y - e.deltaY * 1.1
        }));
      }
    };

    canvasElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvasElement.removeEventListener("wheel", handleWheel);
    };
  }, [isGameStarted, gameStage]);

  // Themed cycling copy for the various "thinking" loaders
  const landscapeLoadingPhrase = useCyclingPhrase(isGeneratingLandscape, [
    "Surveying Subsurface Coordinates",
    "Looking for Drill Possibilities",
    "Mapping Pressure Pockets",
    "Reading Seismic Echoes",
    "Charting Opportunity Crests",
    "Triangulating Uncertainty Rifts",
    "Calibrating the Solution Basin"
  ]);
  const probeLoadingPhrase = useCyclingPhrase(isSynthesizingProbe, [
    "Prospecting drill core formulas inside the local model",
    "Fusing your three anchors into a probe",
    "Distilling an actionable test seed",
    "Pressure-testing the prototype logic",
    "Shaping the experiment boundaries"
  ], 4500);
  const harvestLoadingPhrase = useCyclingPhrase(isHarvesting, [
    "Synthesizing evidence from the discussion",
    "Clustering qualitative signals",
    "Surfacing surprises and frictions",
    "Writing up the findings"
  ], 4500);

  // Initialize and Load preset elements
  const handleStartGame = async (preset: GamePreset) => {
    let finalDesigningFor = preset.designingFor;
    let finalObservations = preset.observations;
    let frame = preset.defaultProblemFrame;

    if (preset.id === "preset-custom") {
      finalDesigningFor = customDesigningFor.trim() || emptyPreset.designingFor;
      finalObservations = customObservations.trim() || emptyPreset.observations;
      frame = `Critical ${finalDesigningFor} Friction: ${finalObservations.slice(0, 40)}...`;
    }

    setProblemFrame(frame);
    setInitialProblemFrame(frame);
    setLoopIndex(1);
    setReframeDrift(0);
    setEvidenceLog([]);
    setHistory([]);
    setSelectedOppId(null);
    setSelectedSolId(null);
    setSelectedUncId(null);
    setJustifications({});
    setProbe(null);
    setRetiredWells([]);
    setGameStage("LANDSCAPE");
    setIsGameStarted(true);

    // Call API to generate a fresh landscape via the local model
    setIsGeneratingLandscape(true);
    try {
      const response = await fetch("/api/landscape/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemFrame: frame })
      });
      if (response.ok) {
        const data = await response.json();
        setOpportunities(data.opportunities || []);
        setSolutions(data.solutions || []);
        setUncertainties(data.uncertainties || []);
        showFeedback("Landscape successfully surveyed via local model.");
      } else {
        throw new Error("API failure");
      }
    } catch (err) {
      console.error("Landscape generation failed:", err);
      setOpportunities([]);
      setSolutions([]);
      setUncertainties([]);
      showFeedback("Generation failed — is Ollama running? Try again.");
    } finally {
      setIsGeneratingLandscape(false);
      focusOnType("opportunities");
    }
  };

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Curation rating handler with drill flags (§4: "Kurator - Favourite Bohrflagge")
  const handleRateCard = (cardId: string, type: CardType, rating: "high" | "medium" | "low") => {
    if (rating === "high") {
      // Enforce structural 1-high threshold constraint ("Knappes High-Budget" / 1 Fav per column)
      let pickedCard: LandscapeCard | undefined;
      if (type === "opportunity") {
        setOpportunities(prev => prev.map(c => ({ ...c, rating: c.id === cardId ? "high" : "low" })));
        setSelectedOppId(cardId);
        pickedCard = opportunities.find(c => c.id === cardId);
      } else if (type === "solution") {
        setSolutions(prev => prev.map(c => ({ ...c, rating: c.id === cardId ? "high" : "low" })));
        setSelectedSolId(cardId);
        pickedCard = solutions.find(c => c.id === cardId);
      } else if (type === "uncertainty") {
        setUncertainties(prev => prev.map(c => ({ ...c, rating: c.id === cardId ? "high" : "low" })));
        setSelectedUncId(cardId);
        pickedCard = uncertainties.find(c => c.id === cardId);
      }
      // Auto fan-out the freshly selected card (unless we already have its branches)
      if (pickedCard && !cardBranches[cardId]) {
        expandCard({ ...pickedCard, rating: "high" });
      }
    } else {
      // Change to medium or low
      if (type === "opportunity") {
        setOpportunities(prev => prev.map(c => c.id === cardId ? { ...c, rating } : c));
        if (selectedOppId === cardId) setSelectedOppId(null);
      } else if (type === "solution") {
        setSolutions(prev => prev.map(c => c.id === cardId ? { ...c, rating } : c));
        if (selectedSolId === cardId) setSelectedSolId(null);
      } else if (type === "uncertainty") {
        setUncertainties(prev => prev.map(c => c.id === cardId ? { ...c, rating } : c));
        if (selectedUncId === cardId) setSelectedUncId(null);
      }
    }
  };

  const handleJustificationChange = (cardId: string, text: string) => {
    setJustifications(prev => ({ ...prev, [cardId]: text }));
  };

  // Mindmap fan-out: ask the model to expand a card into Pro/Contra/Frage branches
  const expandCard = async (card: LandscapeCard) => {
    setBranchLoadingCardId(card.id);
    try {
      const response = await fetch("/api/landscape/expand-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemFrame, card })
      });
      if (!response.ok) throw new Error("expand failed");
      const data = await response.json();
      setCardBranches(prev => ({ ...prev, [card.id]: data.branches || [] }));
    } catch (err) {
      console.error("Card fan-out failed:", err);
      showFeedback("Fan-out failed — is Ollama running? Try again.");
    } finally {
      setBranchLoadingCardId(null);
    }
  };

  const appendBranchToJustification = (cardId: string, branch: CardBranch) => {
    setJustifications(prev => {
      const existing = prev[cardId] || "";
      const addition = `[${branch.kind}] ${branch.title}`;
      return { ...prev, [cardId]: existing ? `${existing}; ${addition}` : addition };
    });
    showFeedback("Branch added to justification.");
  };

  // ----------------------------------------------------------------------
  // Workshop facilitator discussion (used only at the Harvest step, as a way to
  // prep or debrief a real workshop and turn the conversation into findings).
  // ----------------------------------------------------------------------
  const openWorkshop = (step: "harvest") => {
    setWorkshopStep(step);
    setWorkshopTab("discuss");
    setWorkshopMessages([]);
    setWorkshopInput("");
    setWorkshopNotes("");
    setWorkshopSuggestions(WORKSHOP_STARTER_SUGGESTIONS);
  };
  const closeWorkshop = () => setWorkshopStep(null);

  // Keep the facilitator chat pinned to the latest message
  useEffect(() => {
    if (workshopStep && workshopTab === "discuss") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [workshopMessages, workshopBusy, workshopStep, workshopTab]);

  const workshopContext = (): string =>
    `Problem Frame: "${problemFrame}"\nProbe: "${probe?.title}" — ${probe?.description}\nProbe seed action: "${reshapedSeed}"`;

  const sendWorkshopMessage = async (textArg?: string) => {
    const text = (textArg ?? workshopInput).trim();
    if (!text || !workshopStep || workshopBusy) return;
    const newMsgs = [...workshopMessages, { role: "user", content: text }];
    setWorkshopMessages(newMsgs);
    setWorkshopInput("");
    setWorkshopSuggestions([]);
    setWorkshopBusy(true);
    try {
      const response = await fetch("/api/workshop/discuss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: workshopStep, context: workshopContext(), messages: newMsgs })
      });
      if (!response.ok) throw new Error("discuss failed");
      const data = await response.json();
      setWorkshopMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      setWorkshopSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (err) {
      console.error("Workshop discussion failed:", err);
      showFeedback("Discussion failed — is Ollama running?");
    } finally {
      setWorkshopBusy(false);
    }
  };

  // Demo placeholders shown in the findings editor before anything real is entered
  const DEMO_FINDING_TITLES = ["Empirical Finding A", "Empirical Finding B"];

  // "Apply" sorts the facilitator discussion (chat or pasted notes) into the right
  // places: a recap (shown after the brief), prep points (appended to the brief),
  // and findings (pre-filled into the "enter findings" editor). It does NOT run the
  // harvest — the user still runs their real workshop, then enters findings.
  const applyWorkshop = async () => {
    if (!workshopStep) return;
    const transcript = workshopMessages
      .map(m => `${m.role === "user" ? "Participant" : "Facilitator"}: ${m.content}`)
      .join("\n");
    const source = workshopTab === "notes" ? workshopNotes.trim() : transcript.trim();
    if (!source) {
      showFeedback("Nothing to apply — discuss or write notes first.");
      return;
    }
    setIsApplyingWorkshop(true);
    try {
      const response = await fetch("/api/workshop/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: workshopContext(), transcript: source })
      });
      if (!response.ok) throw new Error("apply failed");
      const data = await response.json();

      const newFindings: { title: string; desc: string }[] = (data.findings || [])
        .map((f: any) => ({ title: (f.title || "").trim(), desc: (f.description || "").trim() }))
        .filter((f: { title: string; desc: string }) => f.title || f.desc);
      const additions: string[] = (data.briefAdditions || []).filter((s: string) => s && s.trim());

      // Pre-fill findings into the manual editor, dropping demo placeholders / empty rows
      if (newFindings.length > 0) {
        setWorkshopFindingTexts(prev => {
          const kept = prev.filter(
            f => (f.title.trim() || f.desc.trim()) && !DEMO_FINDING_TITLES.includes(f.title.trim())
          );
          return [...kept, ...newFindings];
        });
      }
      if (additions.length > 0) {
        setWorkshopBriefAdditions(prev => [...prev, ...additions]);
      }
      setWorkshopRecap({
        summary: data.recap || "Discussion applied.",
        conversation: source,
        findingsCount: newFindings.length
      });
      setRecapCopied(false);
      closeWorkshop();

      const parts: string[] = [];
      if (newFindings.length) parts.push(`${newFindings.length} finding${newFindings.length > 1 ? "s" : ""}`);
      if (additions.length) parts.push(`${additions.length} prep note${additions.length > 1 ? "s" : ""}`);
      showFeedback(parts.length ? `Applied: ${parts.join(" + ")}.` : "Discussion recap saved.");
    } catch (err) {
      console.error("Workshop apply failed:", err);
      showFeedback("Apply failed — is Ollama running?");
    } finally {
      setIsApplyingWorkshop(false);
    }
  };

  // Manual workshop findings — users can add as many as they want
  const updateFindingText = (index: number, field: "title" | "desc", value: string) => {
    setWorkshopFindingTexts(prev => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  };
  const addFindingText = () => {
    setWorkshopFindingTexts(prev => [...prev, { title: "", desc: "" }]);
  };
  const removeFindingText = (index: number) => {
    setWorkshopFindingTexts(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  // Inject a surprise Asymmetric Wild Card into the chosen area (§8: "Surprise / Wild Card")
  const wildCardPrompts: Record<CardType, { t: string; d: string }[]> = {
    opportunity: [
      { t: "Radical Inversion", d: "What if the interface actively delays inputs by 10 minutes to reward raw patience?" },
      { t: "Chaotic Translucency", d: "Expose competitors' detailed prompt-usage directly inside the user's workspace." },
      { t: "Friction as Status", d: "Make visible effort a public badge that peers can admire and reward." }
    ],
    solution: [
      { t: "Anti-Solution", d: "Ship a deliberately broken version and let users repair it to learn the system." },
      { t: "Silent Mode", d: "Remove all notifications for a week and measure what users actually miss." },
      { t: "Forced Manual", d: "Require fully manual typing of any AI suggestion before it can be submitted." }
    ],
    uncertainty: [
      { t: "Reverse Risk", d: "What if the safest-looking path is actually the one that quietly fails?" },
      { t: "Hidden Adopter", d: "Could a group we never designed for become the primary, unexpected user?" },
      { t: "Trust Collapse", d: "What happens to the whole system the first time the AI is confidently wrong?" }
    ]
  };

  const handleInjectWildCard = (target: CardType = wildCardTarget) => {
    setWildCardCount(prev => prev + 1);
    const prompts = wildCardPrompts[target];
    const picked = prompts[wildCardCount % prompts.length];

    const newCard: LandscapeCard = {
      id: `${target}-wild-${Date.now()}`,
      type: target,
      title: picked.t,
      description: picked.d,
      extraLabel: "★ Wild Card Leap",
      rating: "low",
      isWildCard: true
    };

    if (target === "opportunity") {
      setOpportunities(prev => [newCard, ...prev]);
      focusOnType("opportunities");
    } else if (target === "solution") {
      setSolutions(prev => [newCard, ...prev]);
      focusOnType("solutions");
    } else {
      setUncertainties(prev => [newCard, ...prev]);
      focusOnType("uncertainties");
    }
    showFeedback(`An asymmetric Wild Card was injected into the ${target} area!`);
  };

  // Stage 3 Start: Synthesize Chosen Cards into 1 Prototype / Probe Family
  const handleSynthesizeProbe = async () => {
    const opp = opportunities.find(c => c.id === selectedOppId);
    const sol = solutions.find(c => c.id === selectedSolId);
    const unc = uncertainties.find(c => c.id === selectedUncId);

    if (!opp || !sol || !unc) {
      alert("Please place exactly one Drill Flag (High rating) in each of the three map regions first.");
      return;
    }

    setIsSynthesizingProbe(true);
    setGameStage("PROBE_CURATION");
    // Fresh probe → fresh workshop session
    setWorkshopBriefAdditions([]);
    setWorkshopRecap(null);

    try {
      const response = await fetch("/api/landscape/synthesize-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemFrame,
          opportunity: opp,
          solution: sol,
          uncertainty: unc
        })
      });

      if (response.ok) {
        const data = await response.json();
        setProbe(data);
        setReshapedSeed(data.seed || "");
      } else {
        throw new Error("Synthesis error");
      }
    } catch (err) {
      console.error("Probe synthesis failed:", err);
      setProbe(null);
      setGameStage("LANDSCAPE");
      showFeedback("Synthesis failed — is Ollama running? Try again.");
    } finally {
      setIsSynthesizingProbe(false);
    }
  };

  // Probe → real-workshop jump-off: open the launch pad and generate a workshop brief
  const launchWorkshop = async () => {
    setGameStage("WORKSHOP_LAUNCH");
    setWorkshopBrief(null);
    setIsLoadingBrief(true);
    try {
      const response = await fetch("/api/workshop/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemFrame,
          probe: { title: probe?.title, description: probe?.description, seed: reshapedSeed },
          audience: selectedPreset.designingFor
        })
      });
      if (!response.ok) throw new Error("brief failed");
      const data = await response.json();
      setWorkshopBrief(data);
    } catch (err) {
      console.error("Workshop brief failed:", err);
      showFeedback("Brief failed — is Ollama running? Try again.");
    } finally {
      setIsLoadingBrief(false);
    }
  };

  // Export the workshop brief as a print-ready page (browser "Save as PDF").
  // Dependency-free: opens a clean printable window and triggers the print dialog.
  const exportBriefPdf = () => {
    if (!workshopBrief) return;
    const esc = (s: string) =>
      String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const li = (items: string[]) => items.map(i => `<li>${esc(i)}</li>`).join("");
    const agenda = workshopBrief.agenda
      .map(s => `<tr><td class="time">${esc(s.time)}</td><td>${esc(s.activity)}</td></tr>`)
      .join("");
    const prep = workshopBriefAdditions.length
      ? `<h2>Prep notes</h2><ul>${li(workshopBriefAdditions)}</ul>`
      : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Workshop Brief — ${esc(probe?.title || "")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 40px; line-height: 1.5; }
  header { border-bottom: 3px solid #6366f1; padding-bottom: 12px; margin-bottom: 24px; }
  .kicker { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #6366f1; font-weight: 700; }
  h1 { font-size: 24px; margin: 4px 0 0; }
  .probe { background: #f1f5f9; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px; }
  .probe p { margin: 6px 0 0; font-size: 13px; }
  .seed { font-style: italic; color: #4338ca; }
  h2 { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #475569; margin: 24px 0 8px; }
  .obj { font-size: 15px; font-weight: 600; }
  .cols { display: flex; gap: 32px; }
  .cols > div { flex: 1; }
  ul { margin: 6px 0; padding-left: 18px; font-size: 13px; }
  li { margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.time { font-weight: 700; color: #7c3aed; white-space: nowrap; width: 90px; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
  @media print { body { margin: 24px; } }
</style></head><body>
<header>
  <div class="kicker">Workshop Brief</div>
  <h1>${esc(probe?.title || "Untitled probe")}</h1>
</header>
<div class="probe">
  <strong>Probe:</strong> ${esc(probe?.description || "")}
  ${reshapedSeed ? `<p class="seed">"${esc(reshapedSeed)}"</p>` : ""}
</div>
<h2>Objective</h2>
<p class="obj">${esc(workshopBrief.objective)}</p>
<div class="cols">
  <div><h2>Who to invite</h2><ul>${li(workshopBrief.invite)}</ul></div>
  <div><h2>What to capture</h2><ul>${li(workshopBrief.capture)}</ul></div>
</div>
<h2>~30-minute agenda</h2>
<table>${agenda}</table>
${prep}
<footer>Problem frame: ${esc(problemFrame)}</footer>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) {
      showFeedback("Allow pop-ups to export the brief as PDF.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // Give the new window a tick to render before invoking print
    setTimeout(() => win.print(), 350);
  };

  // Stage 5: Run & harvest the probe. `mode` is explicit (set at the Probe/Launch fork)
  // so we don't depend on possibly-stale `workshopMode` state.
  const handleExecuteProbe = async (mode: "ai" | "workshop" = workshopMode ? "workshop" : "ai") => {
    setWorkshopMode(mode === "workshop");
    setGameStage("RUN_HARVEST");
    setIsHarvesting(true);
    setSimulationProgress(5);
    const stampLog = (msg: string) => ({ time: new Date().toLocaleTimeString(), msg });
    setRunLogMessages([stampLog("Establishing drill rig interface at prospect site..."), stampLog("Reading human context feedback flow...")]);

    const intervals = [
      { p: 25, m: "Friction triggers calibrated. Spawning test components on client workspaces..." },
      { p: 50, m: "Active monitoring launched. Analyzing user response vectors and attention dropoffs..." },
      { p: 75, m: "Capturing qualitative logs & structural schemas..." },
      { p: 95, m: "Aggregating evidence matrices in database..." }
    ];

    intervals.forEach((step, idx) => {
      setTimeout(() => {
        setSimulationProgress(step.p);
        setRunLogMessages(prev => [...prev, stampLog(step.m)]);
      }, (idx + 1) * 800);
    });

    setTimeout(async () => {
      if (mode === "workshop") {
        // Human Workshop manual entry — keep only entries with at least a title or description
        const customFindings: Finding[] = workshopFindingTexts
          .filter(f => f.title.trim() || f.desc.trim())
          .map((f, i) => ({
            id: `manual-finding-${Date.now()}-${i}`,
            title: f.title.trim() || `Finding ${i + 1}`,
            description: f.desc.trim() || "Observed outcome (no description provided)."
          }));
        setFindings(customFindings);
        setSimulationProgress(100);
        setIsHarvesting(false);
        setRunLogMessages(prev => [...prev, stampLog("Completed live workshop manual harvest. Review data below.")]);
      } else {
        // AI Generated simulation findings via API
        try {
          const response = await fetch("/api/landscape/harvest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              problemFrame,
              probeTitle: probe?.title,
              probeDescription: probe?.description,
              probeSeed: reshapedSeed
            })
          });

          if (response.ok) {
            const data = await response.json();
            setFindings(data.findings || []);
            setRunLogMessages(prev => [...prev, stampLog("Qualitative telemetry collected."), stampLog("Primary insights logged into current evidence board.")]);
          } else {
            throw new Error("Harvest error");
          }
        } catch (err) {
          console.error("Harvest failed:", err);
          setFindings([]);
          setRunLogMessages(prev => [...prev, stampLog("Harvest failed — is Ollama running? Try again.")]);
          showFeedback("Harvest failed — is Ollama running? Try again.");
        } finally {
          setSimulationProgress(100);
          setIsHarvesting(false);
        }
      }
    }, 4200);
  };

  // Stage 6: Mutate Landscape with Evidence and co-evolve the Problem Frame.
  const handleCommitLandscapeUpdate = async () => {
    setIsReframing(true);
    
    const opp = opportunities.find(c => c.id === selectedOppId);
    const sol = solutions.find(c => c.id === selectedSolId);
    const unc = uncertainties.find(c => c.id === selectedUncId);

    // Save Selected favorite cards to the Retired Wells visual log ("Spur der Exploration") before we rotate
    const localRetired: RetiredWell[] = [];
    if (opp) {
      const pos = getRetiredWellPosition("opportunity", loopIndex);
      localRetired.push({
        id: `retired-${opp.id}-${Date.now()}`,
        title: opp.title,
        type: "opportunity",
        x: pos.x,
        y: pos.y,
        loopIndex,
        description: opp.description
      });
    }
    if (sol) {
      const pos = getRetiredWellPosition("solution", loopIndex);
      localRetired.push({
        id: `retired-${sol.id}-${Date.now()}`,
        title: sol.title,
        type: "solution",
        x: pos.x,
        y: pos.y,
        loopIndex,
        description: sol.description
      });
    }
    if (unc) {
      const pos = getRetiredWellPosition("uncertainty", loopIndex);
      localRetired.push({
        id: `retired-${unc.id}-${Date.now()}`,
        title: unc.title,
        type: "uncertainty",
        x: pos.x,
        y: pos.y,
        loopIndex,
        description: unc.description
      });
    }

    setRetiredWells(prev => [...prev, ...localRetired]);

    try {
      const response = await fetch("/api/landscape/reframe-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialProblemFrame,
          currentProblemFrame: problemFrame,
          newEvidenceFindings: findings,
          selectedOpportunity: opp,
          selectedSolution: sol,
          selectedUncertainty: unc
        })
      });

      let updatedFrame = "";
      let driftDelta = 10;

      if (response.ok) {
        const data = await response.json();
        updatedFrame = data.updatedProblemFrame;
        driftDelta = data.driftScoreDelta || 10;
      } else {
        throw new Error("Reframe error");
      }

      // Add evidence to logs
      const newEvidence: Evidence = {
        id: `ev-${Date.now()}`,
        loopIndex,
        sourceProbeTitle: probe?.title || "Custom Probe",
        findings: [...findings],
        timestamp: Date.now()
      };
      
      const newHistory: LoopHistory = {
        loopIndex,
        problemFrame,
        selectedOpportunity: opp!,
        selectedSolution: sol!,
        selectedUncertainty: unc!,
        probe: { ...probe!, seed: reshapedSeed },
        findings: [...findings],
        reframeDrift: reframeDrift + driftDelta
      };

      setEvidenceLog(prev => [newEvidence, ...prev]);
      setHistory(prev => [...prev, newHistory]);
      setProblemFrame(updatedFrame);
      setReframeDrift(prev => Math.min(100, prev + driftDelta));

      // Co-evolve the landscape around the mutated frame (fire-and-forget: the
      // landscape view shows its generation loader while this runs)
      void regenerateLandscapeForNextLoop(updatedFrame, findings);
      
      setLoopIndex(prev => prev + 1);
      setGameStage("LANDSCAPE");
      focusOnType("all");

      // Brief, non-intrusive FYI announcing the new loop + what changed
      setLoopTransition({ loop: loopIndex + 1, frame: updatedFrame, drift: driftDelta });
      setTimeout(() => setLoopTransition(null), 4200);

      // Clean selections for the next loop
      setSelectedOppId(null);
      setSelectedSolId(null);
      setSelectedUncId(null);
      setJustifications({});
      setProbe(null);
      focusOnType("center");
    } catch (err) {
      console.error("Reframe failed:", err);
      // Roll back the retired-wells log entries we optimistically added, keep the
      // loop and problem frame unchanged so the user can retry.
      setRetiredWells(prev => prev.filter(w => !localRetired.some(r => r.id === w.id)));
      showFeedback("Reframe failed — is Ollama running? Try again.");
    } finally {
      setIsReframing(false);
    }
  };

  // Co-evolves the landscape for the next loop: regenerates all cards from the mutated
  // problem frame + fresh evidence, avoiding titles already explored in earlier loops.
  const regenerateLandscapeForNextLoop = async (updatedFrame: string, evidence: Finding[]) => {
    const avoidTitles = [
      ...opportunities.map(c => c.title),
      ...solutions.map(c => c.title),
      ...uncertainties.map(c => c.title),
      ...retiredWells.map(w => w.title)
    ];
    setIsGeneratingLandscape(true);
    try {
      const response = await fetch("/api/landscape/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemFrame: updatedFrame, evidence, avoidTitles })
      });
      if (!response.ok) throw new Error("API failure");
      const data = await response.json();
      setOpportunities(data.opportunities || []);
      setSolutions(data.solutions || []);
      setUncertainties(data.uncertainties || []);
      showFeedback("Landscape re-surveyed around the mutated problem frame.");
    } catch (err) {
      console.error("Landscape co-evolution failed:", err);
      showFeedback("Couldn't regenerate the landscape — previous cards kept. Is Ollama running?");
    } finally {
      setIsGeneratingLandscape(false);
    }
  };

  // Swaps a single card for a fresh AI-generated alternative grounded in the current frame
  const regenerateCard = async (card: LandscapeCard, type: CardType) => {
    setRefreshingCardId(card.id);
    const otherTitles = [...opportunities, ...solutions, ...uncertainties]
      .filter(c => c.id !== card.id)
      .map(c => c.title);
    try {
      const response = await fetch("/api/landscape/regenerate-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemFrame, card, otherTitles })
      });
      if (!response.ok) throw new Error("regenerate failed");
      const fresh: LandscapeCard = await response.json();
      const swap = (prev: LandscapeCard[]) => prev.map(c => (c.id === card.id ? fresh : c));
      if (type === "opportunity") setOpportunities(swap);
      else if (type === "solution") setSolutions(swap);
      else setUncertainties(swap);
    } catch (err) {
      console.error("Card regeneration failed:", err);
      showFeedback("Card refresh failed — is Ollama running? Try again.");
    } finally {
      setRefreshingCardId(null);
    }
  };

  const handleCopySummary = () => {
    const textLines = [
      `== GENAI GAMES: THE LANDSCAPE SESSION TRACE ==`,
      `Initial Problem Frame: ${initialProblemFrame}`,
      `Final Mutated Problem: "${problemFrame}"`,
      `Final Reframe Drift Delta: ${reframeDrift}%`,
      `Total Completed Co-Evolutionary Loops: ${loopIndex - 1}`,
      `----------------------------------------------------`,
      `HISTORIC STAGE TRAJECTORIES:`
    ];

    history.forEach((h, idx) => {
      textLines.push(
        `\n[LOOP ${h.loopIndex} TRANSITION]`,
        `- PROBLEM UNDERGOING INJECTION: "${h.problemFrame}"`,
        `- CHOSEN OPPORTUNITY AREA: ${h.selectedOpportunity.title} ("${h.selectedOpportunity.description}")`,
        `- CHOSEN SOLUTION FAMILY: ${h.selectedSolution.title} ("${h.selectedSolution.description}")`,
        `- TESTED UNCERTAINTY FIELD: ${h.selectedUncertainty.title} ("${h.selectedUncertainty.description}")`,
        `- DYNAMIC PROBE SEED PROSPECTED: "${h.probe.seed}"`,
        `- EVIDENCE REVEALED IN DRILL:`,
        ...h.findings.map(f => `  * ${f.title}: ${f.description}`)
      );
    });

    navigator.clipboard.writeText(textLines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // System-slice heuristic: highlight cards in OTHER areas that share keywords with
  // the currently selected card(s). NOTE: keyword-overlap for now — may be swapped
  // for an AI-computed relatedness endpoint later.
  const RELATED_STOPWORDS = new Set([
    "the", "and", "for", "with", "that", "this", "into", "from", "your", "their", "when", "what", "will",
    "are", "not", "but", "you", "can", "via", "per", "than", "then", "they", "them", "its", "our", "out",
    "off", "more", "less", "user", "users", "system", "systems", "design", "designs", "make", "made",
    "ai", "llm", "human", "humans", "feel", "feels", "without", "while", "must", "need", "needs"
  ]);
  const tokenizeKeywords = (text: string): string[] =>
    Array.from(new Set((text || "").toLowerCase().match(/[a-z]{4,}/g)?.filter(w => !RELATED_STOPWORDS.has(w)) || []));

  const computeRelatedCardIds = (): Set<string> => {
    const related = new Set<string>();
    const selected: { card: LandscapeCard; area: CardType }[] = [];
    const o = opportunities.find(c => c.id === selectedOppId);
    if (o) selected.push({ card: o, area: "opportunity" });
    const s = solutions.find(c => c.id === selectedSolId);
    if (s) selected.push({ card: s, area: "solution" });
    const u = uncertainties.find(c => c.id === selectedUncId);
    if (u) selected.push({ card: u, area: "uncertainty" });
    if (selected.length === 0) return related;

    const selKeywords = selected.map(sel => ({
      area: sel.area,
      kw: new Set(tokenizeKeywords(`${sel.card.title} ${sel.card.description}`))
    }));

    const allCards: { card: LandscapeCard; area: CardType }[] = [
      ...opportunities.map(c => ({ card: c, area: "opportunity" as CardType })),
      ...solutions.map(c => ({ card: c, area: "solution" as CardType })),
      ...uncertainties.map(c => ({ card: c, area: "uncertainty" as CardType }))
    ];

    for (const item of allCards) {
      if (item.card.rating === "high") continue; // skip the selected anchors themselves
      const kw = tokenizeKeywords(`${item.card.title} ${item.card.description}`);
      for (const sel of selKeywords) {
        if (sel.area === item.area) continue; // only cross-area relations form the "slice"
        if (kw.some(w => sel.kw.has(w))) {
          related.add(item.card.id);
          break;
        }
      }
    }
    return related;
  };

  // Mindmap fan-out renderer: shows Pro / Contra / Frage branch chips for a selected
  // card. Each branch is selectable and gets appended to the card's justification.
  const branchStyle = (kind: CardBranch["kind"]) =>
    kind === "pro"
      ? { dot: "bg-emerald-400", border: "border-emerald-700/50", text: "text-emerald-300", label: "PRO" }
      : kind === "contra"
        ? { dot: "bg-rose-400", border: "border-rose-700/50", text: "text-rose-300", label: "CON" }
        : { dot: "bg-sky-400", border: "border-sky-700/50", text: "text-sky-300", label: "QUESTION" };

  const renderCardFanOut = (card: LandscapeCard): React.ReactNode => {
    const branches = cardBranches[card.id];
    const loading = branchLoadingCardId === card.id;
    return (
      <div className="mt-2 pt-2 border-t border-white/5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[8px] font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1">
            <Layers className="w-2.5 h-2.5" /> Mindmap depth
          </span>
          <button
            onClick={() => expandCard(card)}
            className="text-[8px] font-mono text-slate-500 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${loading ? "animate-spin" : ""}`} />
            <span>{branches?.length ? "Refresh" : "Expand"}</span>
          </button>
        </div>

        {loading && !branches?.length && (
          <p className="text-[8px] font-mono text-slate-500">Expanding Pro / Con / Question…</p>
        )}

        {branches && branches.length > 0 && (
          <div className="space-y-1.5">
            {branches.map(b => {
              const bs = branchStyle(b.kind);
              return (
                <button
                  key={b.id}
                  onClick={() => appendBranchToJustification(card.id, b)}
                  className={`w-full text-left rounded-lg border ${bs.border} bg-slate-950/80 hover:bg-slate-900 p-1.5 cursor-pointer transition-colors`}
                  title="Add to justification"
                >
                  <span className={`text-[7px] font-mono font-bold tracking-widest flex items-center gap-1 ${bs.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${bs.dot}`} /> {bs.label} · {b.title}
                  </span>
                  <p className="text-[8px] text-slate-400 leading-snug mt-0.5">{b.description}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ----------------------------------------------------------------------
  // Loose "billiard" card layout + per-type theming for the three regions
  // ----------------------------------------------------------------------
  const clusterOffsets = [
    { x: -158, y: -120, rot: -5 },
    { x: 150, y: -104, rot: 5 },
    { x: -70, y: 134, rot: -3 },
    { x: 168, y: 120, rot: 6 },
    { x: -188, y: 56, rot: 4 },
    { x: 70, y: -170, rot: -6 }
  ];
  const getClusterOffset = (i: number) => clusterOffsets[i % clusterOffsets.length];

  const cardTheme: Record<CardType, {
    bg: string; ring: string; glow: string; title: string; flagActive: string;
    justBorder: string; justText: string; justLabel: string; labelFallback: string; placeholder: string;
  }> = {
    opportunity: {
      bg: "bg-emerald-950/50", ring: "border-emerald-500", glow: "shadow-emerald-950/40", title: "text-emerald-100",
      flagActive: "bg-emerald-500", justBorder: "border-emerald-900/60", justText: "text-emerald-200",
      justLabel: "text-emerald-400", labelFallback: "Core Terrain", placeholder: "Explain leverage..."
    },
    solution: {
      bg: "bg-purple-950/50", ring: "border-purple-500", glow: "shadow-purple-950/40", title: "text-purple-100",
      flagActive: "bg-purple-500", justBorder: "border-purple-900/60", justText: "text-purple-200",
      justLabel: "text-purple-400", labelFallback: "Core concept", placeholder: "Explain logic connection..."
    },
    uncertainty: {
      bg: "bg-amber-950/50", ring: "border-amber-500", glow: "shadow-amber-950/40", title: "text-amber-100",
      flagActive: "bg-amber-400", justBorder: "border-amber-900/60", justText: "text-amber-200",
      justLabel: "text-amber-400", labelFallback: "Core question", placeholder: "Explain critical risk..."
    }
  };

  // [Phase C] Heuristic system-slice: ids of cards related to the current selection.
  // Filled in below; stub keeps things safe before computation.
  const relatedCardIds: Set<string> = computeRelatedCardIds();

  // [Phase D] Mindmap fan-out renderer (Pro/Contra/Frage); defined below.
  const renderFanOut = (card: LandscapeCard) => renderCardFanOut(card);

  // Renders a single landscape card, absolutely positioned in a loose cluster around
  // its region center. Selected (high) cards straighten, scale up and rise above.
  const renderLandscapeCard = (card: LandscapeCard, type: CardType, index: number) => {
    const isHigh = card.rating === "high";
    const t = cardTheme[type];
    const off = getClusterOffset(index);
    const isRelated = relatedCardIds.has(card.id);
    return (
      <div
        key={card.id}
        className={`absolute ${isHigh ? "z-50" : "z-20 hover:z-40"}`}
        style={{
          left: 0,
          top: 0,
          width: "210px",
          transform: `translate(-50%, -50%) translate(${off.x}px, ${off.y}px) rotate(${isHigh ? 0 : off.rot}deg) scale(${isHigh ? 1.06 : 1})`,
          transition: "transform 0.3s ease"
        }}
      >
        <div
          className={`w-full rounded-xl border transition-all duration-300 p-3 select-text flex flex-col justify-between ${
            isHigh
              ? `${t.bg} ${t.ring} shadow-lg ${t.glow}`
              : isRelated
                ? "bg-slate-900/95 border-sky-500/60 ring-1 ring-sky-400/40 shadow-md shadow-sky-950/30"
                : "bg-slate-900/95 border-slate-800 hover:bg-slate-900 hover:border-slate-700"
          }`}
        >
          <div className="relative">
            {card.isWildCard && (
              <span className="absolute -top-6 left-0 bg-indigo-600 text-white text-[8px] font-mono tracking-wider font-extrabold uppercase px-2 py-0.5 rounded shadow">
                ★ Asymmetry Wild Card
              </span>
            )}
            {isRelated && !isHigh && (
              <span className="absolute -top-6 right-0 bg-sky-600/90 text-white text-[7px] font-mono tracking-wider font-bold uppercase px-1.5 py-0.5 rounded shadow">
                ↔ in context
              </span>
            )}

            <span className="text-[9px] font-mono font-semibold tracking-wide text-slate-400 uppercase bg-slate-950 px-2 py-0.5 rounded inline-block mb-1.5 border border-slate-850">
              {card.extraLabel || t.labelFallback}
            </span>

            {!isHigh && (
              <button
                onClick={() => regenerateCard(card, type)}
                disabled={refreshingCardId === card.id}
                title="Regenerate this card from the current problem frame"
                className="absolute top-0 right-0 p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-70 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${refreshingCardId === card.id ? "animate-spin" : ""}`} />
              </button>
            )}

            <h4 className={`text-xs font-bold mb-1 font-display tracking-tight ${t.title}`}>{card.title}</h4>
            <p className="text-[10px] text-slate-300 leading-relaxed mb-2 line-clamp-3">{card.description}</p>
          </div>

          {/* Flag Selection toggle */}
          <div className="border-t border-slate-850 pt-2 flex items-center justify-between text-[10px] font-mono select-none">
            <span className="text-slate-500 font-mono text-[8px] uppercase tracking-wider">DRILL PILOT:</span>
            <button
              onClick={() => handleRateCard(card.id, type, isHigh ? "low" : "high")}
              className={`px-2 py-1 rounded text-[8px] font-mono tracking-wide uppercase flex items-center gap-1 cursor-pointer transition-all ${
                isHigh
                  ? `${t.flagActive} text-slate-950 font-extrabold`
                  : "bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-850 hover:text-slate-200"
              }`}
            >
              {isHigh ? (<><Check className="w-3" /><span>Flag Placed</span></>) : (<><MapPin className="w-3" /><span>Place Flag</span></>)}
            </button>
          </div>

          {/* Justification + mindmap fan-out appear when selected */}
          {isHigh && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <label className={`block text-[8px] font-mono uppercase tracking-widest mb-1 ${t.justLabel}`}>
                Why drill this spot? / JUSTIFICATION:
              </label>
              <input
                type="text"
                value={justifications[card.id] || ""}
                onChange={(e) => handleJustificationChange(card.id, e.target.value)}
                placeholder={t.placeholder}
                className={`w-full bg-slate-950 border rounded p-1 text-[9px] focus:outline-none font-mono ${t.justBorder} ${t.justText}`}
              />
              {renderFanOut(card)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div id="landscape-app-container" className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-purple-900 selection:text-purple-100">
      
      {/* Dynamic Action Alerts */}
      <AnimatePresence>
        {feedbackMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -45 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -45 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#10B981]/10 border border-[#10B981]/40 px-5 py-3 rounded-full shadow-lg shadow-black/80 flex items-center gap-2.5 text-xs text-emerald-300 font-mono"
          >
            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>{feedbackMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* STAGE 0: CO-EVOLUTIONARY HANDOFF BRIDGE */}
      {!isGameStarted ? (
        <div id="stage0-bridge" className="max-w-5xl mx-auto px-4 py-12 flex flex-col justify-center min-h-screen">
          <div className="text-center mb-12">
            <h1 className="text-6xl md:text-8xl font-display font-bold tracking-tight text-white mb-4">
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-emerald-400 bg-clip-text text-transparent">Coevolve</span>
            </h1>
            <p className="text-slate-400 max-w-2xl mx-auto text-sm leading-relaxed">
              Frame a problem, then map its opportunities, solutions, and uncertainties on a living field. Drill probes to test with real people or a local AI, harvest what you learn, and watch your problem reframe — loop after loop.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {gamePresets.map(preset => (
              <div 
                key={preset.id}
                onClick={() => setSelectedPreset(preset)}
                className={`cursor-pointer rounded-2xl p-6 border transition-all relative flex flex-col justify-between ${
                  selectedPreset.id === preset.id 
                    ? "border-purple-500 bg-slate-900/90 shadow-lg shadow-purple-950/30" 
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono text-purple-300 font-bold bg-purple-950/40 px-2.5 py-1 rounded border border-purple-900/50">{preset.label}</span>
                    {selectedPreset.id === preset.id && (
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-white mb-2">{preset.designingFor}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                    {preset.observations}
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-800/60 flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Interactive Seed Elements Ready</span>
                </div>
              </div>
            ))}
          </div>

          {/* Setup Bespoke Problem context */}
          <div className="bg-slate-900/60 border border-slate-850 rounded-2xl p-6 mb-8 shadow-inner">
            <div className="flex items-center gap-2 mb-4">
              <Compass className="w-5 h-5 text-purple-400" />
              <h2 className="text-sm font-bold tracking-tight text-slate-200">Or define your own problem</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">Designing For / Target Context</label>
                <input 
                  type="text" 
                  value={customDesigningFor}
                  onChange={(e) => {
                    setCustomDesigningFor(e.target.value);
                    setSelectedPreset(emptyPreset);
                  }}
                  placeholder="e.g. University Researchers, Night Shift ICU Nurses..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-purple-500 placeholder:text-slate-700 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">Raw Empirical Friction Observations</label>
                <input 
                  type="text" 
                  value={customObservations}
                  onChange={(e) => {
                    setCustomObservations(e.target.value);
                    setSelectedPreset(emptyPreset);
                  }}
                  placeholder="e.g. Workers copy-paste system outputs blindly to speed up tasks..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-purple-500 placeholder:text-slate-700 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => handleStartGame(selectedPreset)}
              className="group relative bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl px-10 py-4 text-xs font-mono font-bold tracking-widest uppercase flex items-center gap-3.5 shadow-lg shadow-purple-950/60 hover:shadow-purple-500/20 transition-all cursor-pointer"
            >
              <span>Initialize Tactical Oilfield</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
            </button>
          </div>
        </div>
      ) : (
        
        /* ACTIVE MAP SYSTEM */
        <div id="game-active-canvas" className="min-h-screen flex flex-col justify-between">
          
          {/* CO-EVOLVED PROBLEM HEADER DASHBOARD */}
          <header className="border-b border-slate-900 bg-slate-950/90 sticky top-0 z-40 backdrop-blur px-8 py-4">
            <div className="w-full flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-800/80 flex items-center justify-center text-purple-400 font-mono text-sm font-extrabold">
                  L{loopIndex}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-mono tracking-widest text-[#10B981] uppercase font-bold">MANY AGENTS · ONE LANDMAP</span>
                    <span className="text-[10px] font-mono text-slate-700">|</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded">
                      Audience: {selectedPreset.designingFor}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase font-mono font-bold text-pink-400">Current Problem Frame:</span>
                    <h2 className="text-sm font-semibold tracking-tight text-white line-clamp-1 italic">
                      "{problemFrame}"
                    </h2>
                  </div>
                </div>
              </div>

              {/* Drift Meter (£8: "Reframe-Meter") */}
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="w-full md:w-48 bg-slate-900 border border-slate-850 rounded-xl p-2.5 flex flex-col justify-center">
                  <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 mb-1">
                    <span className="flex items-center gap-1 uppercase font-bold">
                      <TrendingUp className="w-3.5 h-3.5 text-pink-400" />
                      Reframe-Meter
                    </span>
                    <span className="text-pink-450 font-bold text-pink-400">{reframeDrift}% Drift</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800/50">
                    <div 
                      className="bg-gradient-to-r from-purple-500 via-pink-400 to-emerald-400 h-full transition-all duration-700" 
                      style={{ width: `${reframeDrift}%` }}
                    />
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button 
                    onClick={() => {
                      if(window.confirm("Abandon current trajectories and restart from the Handoff Bridge?")) {
                        setIsGameStarted(false);
                      }
                    }}
                    title="Exit Engine"
                    className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4.5 h-4.5" />
                  </button>

                  <button 
                    onClick={() => setGameStage("REFLECTION")}
                    className="bg-emerald-950 hover:bg-emerald-900 text-emerald-300 hover:text-white border border-emerald-800 px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Award className="w-4.5 h-4.5 text-emerald-400" />
                    <span>Good Enough</span>
                  </button>
                </div>
              </div>

            </div>
          </header>

          {/* MAIN STAGE INTERFACES */}
          <main className="flex-grow relative h-full w-full">
            
            <AnimatePresence mode="wait">
              
              {/* STAGE 1 & 2: THE IMMERSIVE TACTILE MAP CANVAS ("THE OILFIELD") */}
              {gameStage === "LANDSCAPE" && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-[calc(100vh-130px)] overflow-hidden relative select-none"
                >
                  
                  {/* VIEWPORT NAVIGATION HUD CONTROLLER (floating top-left) */}
                  <div className="absolute top-4 left-4 z-20 flex flex-col gap-2.5 bg-slate-950/90 border border-slate-800 p-4 rounded-2xl shadow-xl shadow-black/80 backdrop-blur w-64 select-none">
                    <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                      <span className="text-[10px] font-mono tracking-widest text-slate-450 uppercase font-bold text-slate-400">Tactile Nav HUD</span>
                      <MapPin className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                    
                    <p className="text-[10px] text-slate-400 leading-relaxed font-sans mt-0.5">
                      Drag anywhere on the landscape grid backplate to explore. Use the controls below to shift viewport coordinates instantly.
                    </p>

                    <div className="grid grid-cols-2 gap-1.5 font-mono text-[9px]">
                      <button onClick={() => focusOnType("opportunities")} className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 rounded text-left flex items-center gap-1 text-emerald-450 hover:text-white cursor-pointer select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>1. Opportunities</span>
                      </button>
                      <button onClick={() => focusOnType("solutions")} className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 rounded text-left flex items-center gap-1 text-purple-400 hover:text-white cursor-pointer select-none font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-450" />
                        <span>2. Solutions</span>
                      </button>
                      <button onClick={() => focusOnType("uncertainties")} className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 rounded text-left flex items-center gap-1 text-amber-500 hover:text-white cursor-pointer select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span>3. Uncertainties</span>
                      </button>
                      <button onClick={() => focusOnType("center")} className="px-2 py-1.5 bg-slate-900 hover:bg-secondary border border-slate-850 rounded text-left flex items-center gap-1 text-indigo-400 hover:text-white cursor-pointer select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                        <span>Core Drill Core</span>
                      </button>
                    </div>

                    <button onClick={() => focusOnType("all")} className="w-full mt-1 py-1.5 bg-slate-905 hover:bg-slate-800 border border-slate-850 rounded font-mono text-[9px] uppercase tracking-wider text-slate-200 cursor-pointer select-none">
                      Fit Entire Field View
                    </button>

                    {/* Scale Slider */}
                    <div className="flex items-center gap-2 mt-1.5 justify-between text-[10px] font-mono border-t border-slate-850 pt-2.5 text-slate-400">
                      <span>ZOOM SCALE:</span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))} className="w-6 h-6 flex items-center justify-center bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 font-bold select-none cursor-pointer">-</button>
                        <span className="text-[10px] font-semibold text-slate-200 w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(prev => Math.min(1.3, prev + 0.1))} className="w-6 h-6 flex items-center justify-center bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 font-bold select-none cursor-pointer">+</button>
                      </div>
                    </div>
                  </div>

                  {/* HIGH BUDGET COMMISSION ALIGNMENT PANEL */}
                  <div className="absolute top-4 right-4 z-20 bg-slate-950/90 border border-slate-800 p-4 rounded-2xl shadow-xl shadow-black/80 backdrop-blur w-72 text-xs select-none">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-850">
                      <span className="text-[10px] font-mono tracking-widest text-[#10B981] uppercase font-bold">Place your drill flags</span>
                      <Activity className="w-3.5 h-3.5 text-[#10B981]" />
                    </div>
                    
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                      To begin test drilling, plant exactly <span className="font-bold text-[#10B981]">1 Drill Flag</span> (High rating) in each of the three areas.
                    </p>

                    <div className="mt-3.5 space-y-2 font-mono text-[10px]">
                      <div className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded border border-slate-850/60">
                        <span className="flex items-center gap-2 text-slate-300">
                          <span className={`w-2 h-2 rounded-full ${selectedOppId ? 'bg-emerald-400 shadow shadow-emerald-400' : 'bg-slate-700'}`} />
                          1. Opportunity Crest
                        </span>
                        <span className={selectedOppId ? "text-emerald-400 font-bold" : "text-slate-500"}>{selectedOppId ? "COMMITTED" : "AWAITING"}</span>
                      </div>

                      <div className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded border border-slate-850/60">
                        <span className="flex items-center gap-2 text-slate-300">
                          <span className={`w-2 h-2 rounded-full ${selectedSolId ? 'bg-purple-400 shadow shadow-purple-400' : 'bg-slate-700'}`} />
                          2. Solution Basin
                        </span>
                        <span className={selectedSolId ? "text-purple-400 font-bold" : "text-slate-500"}>{selectedSolId ? "COMMITTED" : "AWAITING"}</span>
                      </div>

                      <div className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded border border-slate-850/60">
                        <span className="flex items-center gap-2 text-slate-300">
                          <span className={`w-2 h-2 rounded-full ${selectedUncId ? 'bg-amber-400 shadow shadow-amber-400' : 'bg-slate-700'}`} />
                          3. Uncertainty Rift
                        </span>
                        <span className={selectedUncId ? "text-amber-400 font-bold" : "text-slate-500"}>{selectedUncId ? "COMMITTED" : "AWAITING"}</span>
                      </div>
                    </div>

                    {/* Wild Card area target selector */}
                    <div className="mt-3.5">
                      <span className="text-[8px] font-mono uppercase tracking-widest text-slate-500">Wild Card target area</span>
                      <div className="mt-1 flex bg-slate-950 rounded-lg p-0.5 border border-slate-850 font-mono">
                        {([
                          { key: "opportunity", label: "Opp", active: "bg-emerald-500 text-slate-950" },
                          { key: "solution", label: "Sol", active: "bg-purple-500 text-slate-950" },
                          { key: "uncertainty", label: "Unc", active: "bg-amber-400 text-slate-950" }
                        ] as { key: CardType; label: string; active: string }[]).map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => setWildCardTarget(opt.key)}
                            className={`flex-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase transition-all cursor-pointer ${
                              wildCardTarget === opt.key ? opt.active : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleInjectWildCard()}
                      className="w-full mt-2 py-2 bg-[#10B981]/10 hover:bg-[#10B981]/20 border border-[#10B981]/30 rounded-xl font-mono text-[9px] uppercase tracking-widest text-[#10B981] hover:text-white transition-colors cursor-pointer select-none"
                    >
                      ★ Inject Surprise Wild Card
                    </button>
                  </div>

                  {/* PANORAMIC SCROLLING VIEWPORT BACKPLATE */}
                  <div 
                    id="tactile-oilfield-canvas"
                    className="absolute inset-0 bg-slate-950 bg-grid-dots cursor-grab active:cursor-grabbing overflow-hidden h-full w-full"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleMouseUp}
                  >
                    
                    {/* CANVAS TRANSFORM WRAPPER WITH PAN & ZOOM */}
                    <div 
                      className="absolute origin-center transition-transform duration-75 ease-out select-none"
                      style={{ 
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        width: "1800px",
                        height: "1300px"
                      }}
                    >
                      
                      {/* SVG VECTOR CONNECTION LINES LAYER (§7.5: Connecting paths glow) */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none select-none z-0">
                        {/* Territorial area rings — subtle fill + dashed stroke, stronger when that area has a committed flag */}
                        <circle cx={AREA_CENTERS.opportunity.x} cy={AREA_CENTERS.opportunity.y} r={REGION_R}
                          fill={selectedOppId ? "rgba(16, 185, 129, 0.10)" : "rgba(16, 185, 129, 0.045)"}
                          stroke={selectedOppId ? "rgba(16, 185, 129, 0.55)" : "rgba(16, 185, 129, 0.22)"}
                          strokeWidth={selectedOppId ? 4 : 2.5} strokeDasharray="10 8" className="transition-all duration-500" />
                        <circle cx={AREA_CENTERS.solution.x} cy={AREA_CENTERS.solution.y} r={REGION_R}
                          fill={selectedSolId ? "rgba(168, 85, 247, 0.10)" : "rgba(168, 85, 247, 0.045)"}
                          stroke={selectedSolId ? "rgba(168, 85, 247, 0.55)" : "rgba(168, 85, 247, 0.22)"}
                          strokeWidth={selectedSolId ? 4 : 2.5} strokeDasharray="10 8" className="transition-all duration-500" />
                        <circle cx={AREA_CENTERS.uncertainty.x} cy={AREA_CENTERS.uncertainty.y} r={REGION_R}
                          fill={selectedUncId ? "rgba(245, 158, 11, 0.10)" : "rgba(245, 158, 11, 0.045)"}
                          stroke={selectedUncId ? "rgba(245, 158, 11, 0.55)" : "rgba(245, 158, 11, 0.22)"}
                          strokeWidth={selectedUncId ? 4 : 2.5} strokeDasharray="10 8" className="transition-all duration-500" />

                        {/* Topographic height rings in the center of the oilfield */}
                        <ellipse cx={HUB.x} cy={HUB.y} rx="300" ry="160" fill="none" stroke="rgba(255, 255, 255, 0.02)" strokeWidth="2" />
                        <ellipse cx={HUB.x} cy={HUB.y} rx="200" ry="100" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="2" />
                        <ellipse cx={HUB.x} cy={HUB.y} rx="100" ry="50"  fill="none" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="2" />

                        {/* Connection Glow vectors: from each area's edge (nearest the hub) to the drilling hub */}
                        {selectedOppId && (() => { const e = regionEdge(AREA_CENTERS.opportunity.x, AREA_CENTERS.opportunity.y); return (
                          <g>
                            <line x1={e.x} y1={e.y} x2={HUB.x} y2={HUB.y} stroke="rgba(16, 185, 129, 0.25)" strokeWidth="4" />
                            <line x1={e.x} y1={e.y} x2={HUB.x} y2={HUB.y} stroke="#10B981" strokeWidth="2" className="animate-line-flow" />
                          </g>
                        ); })()}

                        {selectedSolId && (() => { const e = regionEdge(AREA_CENTERS.solution.x, AREA_CENTERS.solution.y); return (
                          <g>
                            <line x1={e.x} y1={e.y} x2={HUB.x} y2={HUB.y} stroke="rgba(168, 85, 247, 0.25)" strokeWidth="4" />
                            <line x1={e.x} y1={e.y} x2={HUB.x} y2={HUB.y} stroke="#a855f7" strokeWidth="2" className="animate-line-flow" />
                          </g>
                        ); })()}

                        {selectedUncId && (() => { const e = regionEdge(AREA_CENTERS.uncertainty.x, AREA_CENTERS.uncertainty.y); return (
                          <g>
                            <line x1={e.x} y1={e.y} x2={HUB.x} y2={HUB.y} stroke="rgba(245, 158, 11, 0.25)" strokeWidth="4" />
                            <line x1={e.x} y1={e.y} x2={HUB.x} y2={HUB.y} stroke="#f59e0b" strokeWidth="2" className="animate-line-flow" />
                          </g>
                        ); })()}
                      </svg>

                      {/* BLURRED MOOD COLOR SHADOWS INSIDE REGIONS */}
                      <div className="absolute top-[280px] left-[230px] w-64 h-64 rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />
                      <div className="absolute top-[280px] left-[1330px] w-64 h-64 rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />
                      <div className="absolute top-[792px] left-[772px] w-64 h-64 rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />

                      {/* TERRITORIAL AREA LABELS (single readable title centered above each region) */}
                      <div className="absolute top-[66px] left-[350px] -translate-x-1/2 text-center pointer-events-none">
                        <span className="inline-block text-lg font-display font-bold uppercase tracking-[0.18em] text-emerald-300 bg-emerald-950/50 border border-emerald-700/40 px-5 py-1.5 rounded-lg shadow-lg shadow-black/40">Opportunity Crest</span>
                      </div>

                      <div className="absolute top-[66px] left-[1450px] -translate-x-1/2 text-center pointer-events-none">
                        <span className="inline-block text-lg font-display font-bold uppercase tracking-[0.18em] text-purple-300 bg-purple-950/50 border border-purple-700/40 px-5 py-1.5 rounded-lg shadow-lg shadow-black/40">Solution Basin</span>
                      </div>

                      <div className="absolute top-[576px] left-[900px] -translate-x-1/2 text-center pointer-events-none">
                        <span className="inline-block text-lg font-display font-bold uppercase tracking-[0.18em] text-amber-300 bg-amber-950/50 border border-amber-700/40 px-5 py-1.5 rounded-lg shadow-lg shadow-black/40">Uncertainty Rift</span>
                      </div>

                      {/* ACTIVE GRAPHICS DORMANT WELLS ("Spur der Exploration") */}
                      {retiredWells.map(well => {
                        const accent = well.type === "opportunity"
                          ? "border-emerald-700/70 text-emerald-500/80"
                          : well.type === "solution"
                          ? "border-purple-700/70 text-purple-400/80"
                          : "border-amber-700/70 text-amber-500/80";
                        return (
                        <div
                          key={well.id}
                          className="absolute z-10 transition-transform hover:scale-105"
                          style={{ left: `${well.x - 16}px`, top: `${well.y - 16}px` }}
                          onMouseEnter={() => setHoveredRetiredWell(well)}
                          onMouseLeave={() => setHoveredRetiredWell(null)}
                        >
                          <div className={`w-8 h-8 rounded-full bg-slate-900 border ${accent} flex items-center justify-center shadow-md cursor-help relative`}>
                            <span className="text-[8px] font-mono font-extrabold">L{well.loopIndex}</span>
                            <div className="absolute -inset-1 rounded-full border border-dashed border-slate-800 animate-spin" style={{ animationDuration: "12s" }} />
                          </div>
                        </div>
                        );
                      })}

                      {/* DORMANT WELL HOVER INFO BOX */}
                      {hoveredRetiredWell && (
                        <div 
                          className="absolute z-55 bg-slate-950/95 border border-slate-800 p-3.5 rounded-xl text-left shadow-2xl w-60 text-[10px] backdrop-blur select-none pointer-events-none"
                          style={{ left: `${hoveredRetiredWell.x + 22}px`, top: `${hoveredRetiredWell.y - 10}px` }}
                        >
                          <span className="text-[8px] font-mono uppercase text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded font-extrabold">
                            Loop {hoveredRetiredWell.loopIndex} dormant well
                          </span>
                          <h4 className="font-bold text-white mt-1.5 line-clamp-1">{hoveredRetiredWell.title}</h4>
                          <p className="text-slate-400 mt-1 leading-relaxed line-clamp-3">{hoveredRetiredWell.description}</p>
                          <div className="mt-2 text-[8px] font-mono text-emerald-450 uppercase tracking-widest text-[#10B981]">
                            ✦ explored terrain path
                          </div>
                        </div>
                      )}

                      {/* ======================================================= */}
                      {/* INTERACTIVE COMPACT CARDS CENTERED INSIDE CIRCLE FIELDS */}
                      {/* ======================================================= */}

                      {/* 1. OPPORTUNITY REGION (loose cluster centered at cx=350, cy=400) */}
                      <div className="absolute pointer-events-auto" style={{ left: "350px", top: "400px", zIndex: 20 }}>
                        {opportunities.map((card, index) => renderLandscapeCard(card, "opportunity", index))}
                      </div>

                      {/* 2. SOLUTION REGION (loose cluster centered at cx=1450, cy=400) */}
                      <div className="absolute pointer-events-auto" style={{ left: "1450px", top: "400px", zIndex: 20 }}>
                        {solutions.map((card, index) => renderLandscapeCard(card, "solution", index))}
                      </div>

                      {/* 3. UNCERTAINTY REGION (loose cluster centered at cx=900, cy=920) */}
                      <div className="absolute pointer-events-auto" style={{ left: "900px", top: "920px", zIndex: 20 }}>
                        {uncertainties.map((card, index) => renderLandscapeCard(card, "uncertainty", index))}
                      </div>

                      {/* ======================================================= */}
                      {/* CENTRAL PROSPECTING CENTER HUB / ACTIVE DRILL SITE (§7.5) */}
                      {/* ======================================================= */}
                      <div 
                        className="absolute h-64 w-64 flex flex-col items-center justify-center -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-850/40 bg-slate-950 z-30 pointer-events-auto shadow-2xl shadow-indigo-950/50"
                        style={{ left: "900px", top: "380px" }}
                      >
                        {selectedOppId && selectedSolId && selectedUncId ? (
                          /* Core Drill aligned */
                          <div className="text-center p-3 animate-fade-in relative z-30 pointer-events-auto">
                            {/* concentric targeting ring laser visuals */}
                            <div className="absolute inset-0 rounded-full border border-dashed border-[#10B981]/25 animate-spin w-full h-full" style={{ animationDuration: "14s" }} />
                            <div className="absolute -inset-4 rounded-full border border-[#10B981]/15 animate-ping w-72 h-72 pointer-events-none" style={{ animationDuration: "3s" }} />
                            
                            <div className="w-14 h-14 rounded-full bg-emerald-950 border-2 border-[#10B981] flex items-center justify-center text-[#10B981] mx-auto shadow-xl shadow-[#10B981]/30">
                              <Wand2 className="w-6 h-6 animate-pulse" />
                            </div>
                            <h3 className="text-xs font-bold text-white mt-4 uppercase tracking-wider font-mono">Drill Core Prime</h3>
                            <p className="text-[10px] text-emerald-400/90 max-w-[210px] mt-1.5 font-mono leading-relaxed">
                              Structural flow connected. Core calibration completed.
                            </p>
                            <button 
                              onClick={handleSynthesizeProbe}
                              className="mt-3.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-slate-950 hover:text-white font-mono font-bold text-[10px] uppercase tracking-widest rounded-lg shadow-lg shadow-[#10B981]/20 cursor-pointer select-none relative z-40 pointer-events-auto font-extrabold"
                            >
                              Start Drilling
                            </button>
                          </div>
                        ) : (
                          /* Calibration in progress */
                          <div className="text-center p-3 opacity-70">
                            <div className="w-12 h-12 rounded-full bg-slate-900 border border-dashed border-slate-700 flex items-center justify-center text-slate-500 mx-auto">
                              <Sliders className="w-5 h-5" />
                            </div>
                            <h3 className="text-xs font-bold text-slate-400 mt-3 font-mono uppercase tracking-wider">Awaiting Calibration</h3>
                            <p className="text-[9px] text-slate-500 max-w-[180px] mt-1.5 leading-relaxed font-sans mx-auto">
                              Curate exactly <span className="font-bold text-[#10B981]">1 Drill Flag</span> in Spalte A, B &amp; C to align vectors.
                            </p>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* HIGH-FIDELITY ACTIVE SEISMIC SURVEY DIALOG (LANDSCAPE LOADING STATE) */}
                  <AnimatePresence>
                    {isGeneratingLandscape && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-950/85 z-50 flex flex-col items-center justify-center backdrop-blur-md"
                      >
                        <div className="relative w-44 h-44 flex items-center justify-center">
                          {/* Pulsing Outer Radar Rings */}
                          <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-ping" style={{ animationDuration: "3s" }} />
                          <div className="absolute inset-4 rounded-full border border-dashed border-purple-500/30 animate-spin" style={{ animationDuration: "12s" }} />
                          
                          {/* Inner Scanner Core */}
                          <div className="absolute inset-10 rounded-full bg-slate-900 border border-slate-805 flex items-center justify-center shadow-2xl">
                            <Compass className="w-7 h-7 text-[#10B981] animate-spin" style={{ animationDuration: "6s" }} />
                          </div>

                          {/* Radar sweep laser lines */}
                          <div className="absolute top-1/2 left-1/2 w-22 h-0.5 bg-gradient-to-r from-emerald-500 to-transparent origin-left rotate-45 animate-spin" style={{ animationDuration: "2s" }} />
                          <div className="absolute top-1/2 left-1/2 w-22 h-0.5 bg-gradient-to-r from-purple-500 to-transparent origin-left -rotate-90 animate-spin" style={{ animationDuration: "3.5s" }} />
                        </div>

                        <div className="text-center mt-6 space-y-3 px-6">
                          <span className="text-[9px] font-mono tracking-[0.4em] text-emerald-400 bg-emerald-950/70 border border-emerald-900/60 px-3 py-1 rounded-full uppercase font-bold">
                            {loopIndex > 1 ? `Loop ${loopIndex} · Re-Surveying Mutated Terrain` : "Active Seismic Scan"}
                          </span>
                          <div className="h-7 flex items-center justify-center">
                            <AnimatePresence mode="wait">
                              <motion.h3
                                key={landscapeLoadingPhrase}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.4 }}
                                className="text-base font-bold font-display text-white tracking-tight"
                              >
                                {landscapeLoadingPhrase}…
                              </motion.h3>
                            </AnimatePresence>
                          </div>

                          {/* On loop restarts, show how the problem frame just co-evolved */}
                          {loopIndex > 1 && history.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.3 }}
                              className="max-w-md mx-auto bg-slate-900/80 border border-slate-800 rounded-xl px-5 py-3.5 text-left space-y-1.5"
                            >
                              <span className="block text-[8px] font-mono tracking-[0.3em] text-purple-300 uppercase font-bold">
                                Your problem frame co-evolved
                              </span>
                              <p className="text-[10px] font-mono text-slate-500 leading-relaxed line-through decoration-slate-600">
                                {history[history.length - 1].problemFrame}
                              </p>
                              <p className="text-[11px] text-white font-semibold leading-relaxed">
                                <span className="text-emerald-400 mr-1.5">→</span>
                                "{problemFrame}"
                              </p>
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </motion.div>
              )}

              {/* STAGE 3 & 4: PROBE FAMILY SYNTHESIS & REVIEW */}
              {gameStage === "PROBE_CURATION" && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="max-w-4xl mx-auto px-4 py-10"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono tracking-widest text-purple-400 uppercase">Synthesized probe</span>
                      <h2 className="text-2xl font-bold font-display text-white">Your prospected probe</h2>
                    </div>

                    <button 
                      onClick={() => setGameStage("LANDSCAPE")}
                      className="text-xs font-mono text-slate-400 hover:text-white flex items-center gap-1 bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-800 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retreat to Landscape Map</span>
                    </button>
                  </div>

                  {/* Curated Tri-Anchor Recap cards */}
                  <div className="grid md:grid-cols-3 gap-5 mb-8">
                    <div className="bg-emerald-950/10 border border-emerald-500/10 rounded-2xl p-5">
                      <span className="text-[9px] font-mono text-[#10B981] uppercase tracking-widest font-extrabold block mb-2">1. Opportunity Anchor</span>
                      <h4 className="text-xs font-bold text-white leading-tight">{opportunities.find(c => c.id === selectedOppId)?.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                        "{opportunities.find(c => c.id === selectedOppId)?.description}"
                      </p>
                    </div>

                    <div className="bg-purple-950/10 border border-purple-500/10 rounded-2xl p-5">
                      <span className="text-[9px] font-mono text-purple-400 uppercase tracking-widest font-extrabold block mb-2">2. Solution Anchor</span>
                      <h4 className="text-xs font-bold text-white leading-tight">{solutions.find(c => c.id === selectedSolId)?.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                        "{solutions.find(c => c.id === selectedSolId)?.description}"
                      </p>
                    </div>

                    <div className="bg-amber-950/10 border border-amber-500/10 rounded-2xl p-5">
                      <span className="text-[9px] font-mono text-amber-500 uppercase tracking-widest font-extrabold block mb-2">3. Tested Uncertainty Anchor</span>
                      <h4 className="text-xs font-bold text-white leading-tight">{uncertainties.find(c => c.id === selectedUncId)?.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                        "{uncertainties.find(c => c.id === selectedUncId)?.description}"
                      </p>
                    </div>
                  </div>

                  {/* Generated Probe bento card */}
                  {isSynthesizingProbe ? (
                    <div className="bg-slate-900 border border-slate-850 rounded-2xl py-32 flex flex-col items-center justify-center">
                      <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mb-4" />
                      <div className="h-5 flex items-center justify-center px-6">
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={probeLoadingPhrase}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.35 }}
                            className="text-xs font-mono text-slate-400 text-center"
                          >
                            {probeLoadingPhrase}…
                          </motion.p>
                        </AnimatePresence>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8 shadow-2xl">
                      
                      <div className="flex items-center gap-3.5 mb-5">
                        <div className="w-10 h-10 rounded-full bg-indigo-950 border border-indigo-850 flex items-center justify-center text-indigo-400">
                          <Wand2 className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                          <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest font-bold">Structural Test Formula</span>
                          <h3 className="text-lg font-bold text-white tracking-tight">{probe?.title}</h3>
                        </div>
                      </div>

                      <p className="text-xs text-slate-350 leading-relaxed max-w-4xl mb-6">
                        {probe?.description}
                      </p>

                      {/* Actionable probe seed curation with Reshape option */}
                      <div className="bg-slate-950 rounded-xl p-5 border border-slate-850">
                        <div className="flex items-center justify-between mb-3.5">
                          <label className="block text-[10px] font-mono text-indigo-400 uppercase tracking-widest font-bold">
                            Actionable Probe Seed Directives
                          </label>
                          
                          <button 
                            onClick={() => setIsReshaping(!isReshaping)}
                            className="text-[10px] font-mono text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>{isReshaping ? "Save Changes" : "Reshape Seed"}</span>
                          </button>
                        </div>

                        {isReshaping ? (
                          <div className="flex gap-2">
                            <input 
                              type="text"
                              value={reshapedSeed}
                              onChange={(e) => setReshapedSeed(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                            />
                            <button 
                              onClick={() => setIsReshaping(false)}
                              className="bg-purple-650 hover:bg-purple-500 text-white rounded-lg px-4 text-xs font-mono font-bold uppercase cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div className="py-2.5 px-3 bg-indigo-950/20 border border-indigo-900/30 rounded-lg">
                            <p className="text-xs font-mono text-indigo-300 tracking-wide">
                              "{reshapedSeed}"
                            </p>
                          </div>
                        )}

                        <p className="text-[10px] text-slate-500 leading-relaxed mt-2.5">
                          This is an immediate, high-leverage test action you can deploy offline or online within 24 hours to gather real-world evidence.
                        </p>
                      </div>

                      {/* Actions — deliberate fork: simulate with AI, or take the probe to a real workshop */}
                      <div className="mt-8 pt-6 border-t border-slate-800/80">
                        <p className="text-[11px] text-slate-400 mb-4 text-center sm:text-left">
                          Your probe is ready. <span className="text-white font-semibold">How do you want to test it?</span>
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4">
                          {/* Simulate with AI */}
                          <button
                            onClick={() => handleExecuteProbe("ai")}
                            className="group text-left bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-emerald-700/60 rounded-2xl p-5 transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                                <Play className="w-4 h-4 fill-emerald-400" />
                              </div>
                              <span className="text-sm font-bold text-white">Simulate with AI</span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Run a fast synthetic test and let the model generate plausible findings now.
                            </p>
                            <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-emerald-400 group-hover:gap-2 transition-all">
                              Run simulation <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                          </button>

                          {/* Run a real workshop ★ — the deliberate jump-off */}
                          <button
                            onClick={launchWorkshop}
                            className="group text-left bg-indigo-950/40 hover:bg-indigo-950/70 border border-indigo-700/50 hover:border-indigo-500 rounded-2xl p-5 transition-all cursor-pointer relative overflow-hidden"
                          >
                            <span className="absolute top-3 right-3 text-indigo-300/70 text-[9px] font-mono uppercase tracking-widest">★ jump-off</span>
                            <div className="flex items-center gap-2.5 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-indigo-900 border border-indigo-700 flex items-center justify-center text-indigo-200">
                                <BookOpen className="w-4 h-4" />
                              </div>
                              <span className="text-sm font-bold text-white">Run a real workshop</span>
                            </div>
                            <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                              Take this probe to real people. Get a ready-to-run workshop brief, then bring the findings back.
                            </p>
                            <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-indigo-300 group-hover:gap-2 transition-all">
                              Build the brief <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                          </button>
                        </div>

                        <div className="mt-4 flex justify-center">
                          <button
                            onClick={() => {
                              if (window.confirm("Discard synthesis and retreat back to other anchors?")) {
                                setGameStage("LANDSCAPE");
                              }
                            }}
                            className="text-[11px] font-mono font-bold text-rose-400 hover:text-rose-300 rounded-xl px-5 py-2 transition-colors uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Discard Drill Recipe</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  )}
                </motion.div>
              )}

              {/* STAGE 4b: WORKSHOP LAUNCH PAD — the deliberate jump-off into a real workshop */}
              {gameStage === "WORKSHOP_LAUNCH" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="max-w-3xl mx-auto px-4 py-10"
                >
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-mono tracking-widest text-indigo-300 uppercase font-bold">Workshop launch pad</span>
                      <h2 className="text-2xl font-bold font-display text-white">Take this probe to real people</h2>
                      <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                        This is your jump-off point. Run the probe as a real workshop to gather honest feedback and fresh ideas, then bring the findings back.
                      </p>
                    </div>
                    <button
                      onClick={() => setGameStage("PROBE_CURATION")}
                      className="shrink-0 text-xs font-mono text-slate-400 hover:text-white flex items-center gap-1 bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-800 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Back to probe</span>
                    </button>
                  </div>

                  {/* Probe recap */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
                    <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest font-bold">Your probe</span>
                    <h3 className="text-base font-bold text-white mt-1">{probe?.title}</h3>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{probe?.description}</p>
                    <div className="mt-3 py-2 px-3 bg-indigo-950/20 border border-indigo-900/30 rounded-lg">
                      <p className="text-[11px] font-mono text-indigo-300">"{reshapedSeed}"</p>
                    </div>
                  </div>

                  {/* Generated workshop brief */}
                  {isLoadingBrief ? (
                    <div className="bg-slate-900 border border-slate-850 rounded-2xl py-24 flex flex-col items-center justify-center mb-6">
                      <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin mb-3" />
                      <p className="text-xs font-mono text-slate-400">Drafting a runnable workshop brief…</p>
                    </div>
                  ) : workshopBrief ? (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6 space-y-5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <FileText className="w-4 h-4 text-indigo-400" /> Workshop Brief
                        </h3>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={exportBriefPdf}
                            className="text-[10px] font-mono text-indigo-300 hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3 h-3" /> Export PDF
                          </button>
                          <button
                            onClick={launchWorkshop}
                            className="text-[10px] font-mono text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" /> Regenerate
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest font-bold">Objective</span>
                        <p className="text-xs text-slate-200 leading-relaxed mt-1">{workshopBrief.objective}</p>
                      </div>

                      <div className="grid md:grid-cols-2 gap-5">
                        <div>
                          <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Who to invite</span>
                          <ul className="mt-1.5 space-y-1">
                            {workshopBrief.invite.map((p, i) => (
                              <li key={i} className="text-[11px] text-slate-300 flex gap-2 leading-relaxed">
                                <span className="text-emerald-400">•</span><span>{p}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <span className="text-[9px] font-mono text-amber-400 uppercase tracking-widest font-bold">What to capture</span>
                          <ul className="mt-1.5 space-y-1">
                            {workshopBrief.capture.map((c, i) => (
                              <li key={i} className="text-[11px] text-slate-300 flex gap-2 leading-relaxed">
                                <span className="text-amber-400">•</span><span>{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-mono text-purple-400 uppercase tracking-widest font-bold">~30-minute agenda</span>
                        <div className="mt-2 space-y-1.5">
                          {workshopBrief.agenda.map((step, i) => (
                            <div key={i} className="flex gap-3 items-baseline bg-slate-950 border border-slate-850 rounded-lg px-3 py-2">
                              <span className="text-[10px] font-mono font-bold text-purple-300 shrink-0 w-16">{step.time}</span>
                              <span className="text-[11px] text-slate-300 leading-relaxed">{step.activity}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Prep points surfaced by the AI facilitator, folded into the brief */}
                      {workshopBriefAdditions.length > 0 && (
                        <div className="border-t border-indigo-900/40 pt-4">
                          <span className="text-[9px] font-mono text-indigo-300 uppercase tracking-widest font-bold flex items-center gap-1.5">
                            <BookOpen className="w-3 h-3" /> Prep notes from facilitator
                          </span>
                          <ul className="mt-1.5 space-y-1">
                            {workshopBriefAdditions.map((a, i) => (
                              <li key={i} className="text-[11px] text-indigo-100 flex gap-2 leading-relaxed">
                                <span className="text-indigo-400">▸</span><span>{a}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-900 border border-rose-900/40 rounded-2xl p-6 mb-6 text-center">
                      <p className="text-xs text-rose-300">Couldn't generate the brief. Is Ollama running?</p>
                      <button onClick={launchWorkshop} className="mt-3 text-[10px] font-mono uppercase tracking-widest text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg cursor-pointer">Try again</button>
                    </div>
                  )}

                  {/* Facilitator discussion recap — appears once a discussion is applied */}
                  {workshopRecap && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-indigo-950/30 border border-indigo-800/50 rounded-2xl p-6 mb-6"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-mono text-indigo-300 uppercase tracking-widest font-bold flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" /> Facilitator recap
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(workshopRecap.conversation).then(
                              () => { setRecapCopied(true); setTimeout(() => setRecapCopied(false), 2000); },
                              () => showFeedback("Couldn't copy to clipboard.")
                            );
                          }}
                          className="text-[10px] font-mono text-indigo-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
                        >
                          {recapCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {recapCopied ? "Copied" : "Copy conversation"}
                        </button>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">{workshopRecap.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono">
                        {workshopRecap.findingsCount > 0 && (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-800/50 text-emerald-300">
                            {workshopRecap.findingsCount} finding{workshopRecap.findingsCount > 1 ? "s" : ""} → findings editor
                          </span>
                        )}
                        {workshopBriefAdditions.length > 0 && (
                          <span className="px-2.5 py-1 rounded-full bg-indigo-950/50 border border-indigo-800/50 text-indigo-200">
                            {workshopBriefAdditions.length} prep note{workshopBriefAdditions.length > 1 ? "s" : ""} → brief
                          </span>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Actions: AI prep/debrief, or enter the real findings */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800 pt-6">
                    <button
                      onClick={() => openWorkshop("harvest")}
                      className="w-full sm:w-auto text-xs font-mono font-bold text-indigo-300 hover:text-white border border-indigo-800 hover:border-indigo-600 rounded-xl px-5 py-3 transition-colors uppercase flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Prep / debrief with AI facilitator</span>
                    </button>
                    <button
                      onClick={() => handleExecuteProbe("workshop")}
                      className="w-full sm:w-auto bg-[#10B981] hover:bg-emerald-500 text-slate-950 rounded-xl px-7 py-3.5 text-xs font-mono font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer"
                    >
                      <CheckCircle className="w-4.5 h-4.5" />
                      <span>I've run it — enter findings</span>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* STAGE 5 & 6: RUN HARVEST INCIDENCE VIEW */}
              {gameStage === "RUN_HARVEST" && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="max-w-3xl mx-auto px-4 py-10"
                >
                  <div className="mb-6">
                    <span className="text-[10px] font-mono tracking-widest text-[#10B981] uppercase font-bold">Run &amp; harvest</span>
                    <h2 className="text-2xl font-bold font-display text-white">Run the probe &amp; harvest evidence</h2>
                  </div>

                  {/* Simulation Console Screen */}
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 mb-6 shadow-xl">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                      <span className="text-[10px] font-mono text-[#10B981] uppercase flex items-center gap-2 font-bold tracking-wider">
                        <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping" />
                        Drill Rig telemetry feed
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">QUALITATIVE SIGNAL MAPPER</span>
                    </div>

                    <div className="bg-slate-950 rounded-xl p-4 font-mono text-[11px] text-slate-400 flex flex-col gap-2 h-48 overflow-y-auto border border-slate-900">
                      {runLogMessages.map((entry, i) => (
                        <div key={i} className="flex gap-2.5">
                          <span className="text-slate-650 text-slate-500 font-mono shrink-0">{`[${entry.time}]`}</span>
                          <span className={`leading-relaxed ${i === runLogMessages.length - 1 ? 'text-[#10B981] font-bold' : ''}`}>
                            {entry.msg}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Progress slider bar */}
                    <div className="flex items-center gap-4 mt-4 font-mono text-[11px] text-slate-400">
                      <div className="flex-grow bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-850">
                        <div 
                          className="bg-[#10B981] h-full transition-all duration-300" 
                          style={{ width: `${simulationProgress}%` }}
                        />
                      </div>
                      <span className="shrink-0">{simulationProgress}%</span>
                    </div>
                  </div>

                  {/* Evidence source — mode was chosen at the Probe / Workshop-launch fork */}
                  {workshopMode ? (
                    <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 mb-6 shadow-inner">
                      <div className="flex items-center justify-between mb-3.5">
                        <div>
                          <h4 className="text-xs font-bold text-white">Enter your workshop findings</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Add one card per insight that came up — as many as you need. Or use the AI facilitator to turn a discussion into findings.
                          </p>
                        </div>
                        <button
                          onClick={() => openWorkshop("harvest")}
                          className="shrink-0 px-3 py-2 rounded-lg text-[9px] font-mono font-bold uppercase text-indigo-300 hover:text-white border border-indigo-800 hover:border-indigo-600 cursor-pointer flex items-center gap-1.5"
                        >
                          <BookOpen className="w-3.5 h-3.5" /> AI facilitator
                        </button>
                      </div>

                      <div className="space-y-3 pt-3 border-t border-slate-800">
                        {workshopFindingTexts.map((f, i) => (
                          <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl p-3 relative">
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-[8px] font-mono text-indigo-400 uppercase font-bold">Insight {i + 1}</label>
                              {workshopFindingTexts.length > 1 && (
                                <button
                                  onClick={() => removeFindingText(i)}
                                  title="Remove insight"
                                  className="text-slate-500 hover:text-rose-400 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              value={f.title}
                              onChange={(e) => updateFindingText(i, "title", e.target.value)}
                              placeholder="Observation (short title)"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 mb-1.5"
                            />
                            <textarea
                              rows={2}
                              value={f.desc}
                              onChange={(e) => updateFindingText(i, "desc", e.target.value)}
                              placeholder="Description — what happened, what was said, what surprised you…"
                              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        ))}

                        <div className="flex items-center justify-between gap-3">
                          <button
                            onClick={addFindingText}
                            className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-300 hover:text-white border border-dashed border-indigo-800 hover:border-indigo-600 rounded-xl px-4 py-2 cursor-pointer flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5" /> Add insight
                          </button>
                          <button
                            onClick={() => handleExecuteProbe("workshop")}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
                          >
                            Save findings
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 bg-slate-900/40 border border-slate-850 rounded-xl px-4 py-2.5 mb-6">
                      <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <p className="text-[11px] text-slate-400">
                        <span className="text-slate-200 font-semibold">AI simulation findings</span> — generated from a fast AI run of the probe.
                      </p>
                    </div>
                  )}

                  {/* Loading indicator while evidence is being synthesized (esp. from a discussion) */}
                  {isHarvesting && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-6 flex flex-col items-center justify-center"
                    >
                      <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin mb-3" />
                      <div className="h-5 flex items-center justify-center px-6">
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={harvestLoadingPhrase}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.35 }}
                            className="text-xs font-mono text-slate-400 text-center"
                          >
                            {harvestLoadingPhrase}…
                          </motion.p>
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}

                  {/* Harvested findings details */}
                  {!isHarvesting && findings.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4 mb-6"
                    >
                      <h3 className="text-sm font-bold text-slate-200">Harvested Qualitative Evidence:</h3>

                      <div className="grid md:grid-cols-2 gap-4">
                        {findings.map((f, i) => (
                          <div 
                            key={f.id} 
                            className={`rounded-2xl border p-5 shadow ${
                              i === 0 
                                ? "bg-emerald-950/10 border-emerald-900/40" 
                                : "bg-purple-950/10 border-purple-950"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 mb-2.5">
                              <span className={`w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-emerald-400' : 'bg-purple-400'}`} />
                              <h4 className={`text-xs font-bold leading-tight uppercase tracking-wider ${i === 0 ? 'text-emerald-100' : 'text-purple-100'}`}>
                                {f.title}
                              </h4>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{f.description}</p>
                          </div>
                        ))}
                      </div>

                      {/* Commit back action */}
                      <div className="pt-6 border-t border-slate-800/80 flex justify-end">
                        <button
                          onClick={() => handleCommitLandscapeUpdate()}
                          disabled={isReframing}
                          className="w-full sm:w-auto bg-[#10B981] hover:bg-emerald-500 disabled:bg-slate-800 text-slate-950 font-mono font-bold uppercase tracking-widest text-xs rounded-xl px-7 py-4 shadow-md shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {isReframing ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Reframing the problem…</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4.5 h-4.5 text-slate-950 shrink-0" />
                              <span>Commit evidence &amp; reframe the problem</span>
                            </>
                          )}
                        </button>
                      </div>

                    </motion.div>
                  )}

                </motion.div>
              )}

              {/* STAGE 7: SESSION RECIPES RECAP REFLECTION SCREEN */}
              {gameStage === "REFLECTION" && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="max-w-4xl mx-auto px-4 py-8"
                >
                  <div className="mb-8 text-center bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/40">
                    <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase bg-emerald-950 border border-emerald-800 px-3.5 py-1 rounded-full inline-block mb-3.5 font-bold">
                      Design Session Concluded
                    </span>
                    <h2 className="text-3xl font-bold font-display text-white tracking-tight">Co-Evolution Summary &amp; Trajectory</h2>
                    <p className="text-xs text-slate-400 mt-1 max-w-xl mx-auto leading-relaxed">
                      See how your findings reshaped the problem statement and revealed better pathways.
                    </p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-5 mb-8">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-2 font-bold">Problem Frame Shift</span>
                      <div>
                        <h3 className="text-2xl font-bold text-white tracking-tight font-display">{reframeDrift}% Drift</h3>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          Evaluates calculated conceptual distance from the launch baseline constraints.
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between block">
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-1 font-bold">Completed Sols</span>
                      <div>
                        <h3 className="text-2xl font-bold text-white tracking-tight font-display">{history.length} Sprints</h3>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          Operational tests completed across coordinates.
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
                      <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest block mb-2 font-bold">Baseline constraint</span>
                      <p className="text-[11px] text-slate-300 leading-relaxed italic">
                        "{initialProblemFrame}"
                      </p>
                    </div>
                  </div>

                  {/* Loop list trajectory history */}
                  <div className="space-y-6 mb-8 select-text">
                    <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                      <History className="w-4 h-4 text-purple-400" />
                      <span>Evolutions Map Logs ({history.length})</span>
                    </h3>

                    {history.length === 0 ? (
                      <div className="py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl text-xs">
                        No co-evolution loops logged. Return to map and curate.
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {history.map((h, i) => (
                          <div key={i} className="bg-slate-905 border border-slate-850 rounded-2xl p-5 relative select-text">
                            <span className="absolute top-4 right-5 text-[9px] font-mono text-slate-500 bg-slate-950 px-2.5 py-1 rounded">
                              LOOP {h.loopIndex} · DRIFT {h.reframeDrift}%
                            </span>
                            
                            <div className="flex items-center gap-2 mb-3 max-w-[80%]">
                              <span className="text-[9px] font-mono uppercase bg-pink-950 border border-pink-900 text-pink-400 font-bold px-2 py-0.5 rounded shrink-0">
                                FRAME
                              </span>
                              <h4 className="text-xs font-bold text-white italic">"{h.problemFrame}"</h4>
                            </div>

                            {/* Chosen anchors */}
                            <div className="grid md:grid-cols-3 gap-4 mb-4 bg-slate-950 px-4 py-3 rounded-xl border border-slate-900 text-[10px]">
                              <div>
                                <span className="text-emerald-400 font-mono tracking-widest block uppercase text-[8px] mb-0.5">Opportunity Area</span>
                                <span className="text-slate-300 font-bold">{h.selectedOpportunity.title}</span>
                              </div>
                              <div>
                                <span className="text-purple-450 font-mono tracking-widest block uppercase text-[8px] mb-0.5">Solution Family</span>
                                <span className="text-slate-300 font-bold text-purple-200">{h.selectedSolution.title}</span>
                              </div>
                              <div>
                                <span className="text-amber-500 font-mono tracking-widest block uppercase text-[8px] mb-0.5">Tested Assumption</span>
                                <span className="text-slate-300 font-bold">{h.selectedUncertainty?.title || "Friction Field"}</span>
                              </div>
                            </div>

                            {/* Probe Seed copy style */}
                            <div className="p-3 bg-indigo-950/20 border border-indigo-900/30 rounded-lg text-xs font-mono text-indigo-300 mb-4 leading-relaxed">
                              <strong>Actionable Probe Seed:</strong> "{h.probe.seed}"
                            </div>

                            {/* Findings */}
                            <div className="space-y-1.5 text-[11px]">
                              <span className="text-[9px] font-mono tracking-widest text-[#10B981] block uppercase font-extrabold">EVIDENCE DETAILS:</span>
                              {h.findings.map((f, fi) => (
                                <div key={fi} className="flex gap-2 text-slate-300 font-sans leading-relaxed">
                                  <span className="text-[#10B981] font-mono font-bold">✦</span>
                                  <span>
                                    <strong>{f.title}:</strong> {f.description}
                                  </span>
                                </div>
                              ))}
                            </div>

                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions summary footer */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800 pt-6">
                    <button 
                      onClick={() => setIsGameStarted(false)}
                      className="w-full sm:w-auto text-xs font-mono text-slate-400 hover:text-white border border-slate-800 hover:border-slate-750 rounded-xl px-5 py-3 transition-colors uppercase flex items-center justify-center gap-1.5 cursor-pointer select-none"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Configure New Map Study</span>
                    </button>

                    <button 
                      onClick={handleCopySummary}
                      className="w-full sm:w-auto bg-slate-100 hover:bg-white text-slate-900 px-6 py-3.5 rounded-xl text-xs font-mono font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-white/5 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4.5 h-4.5 text-emerald-600 font-bold shrink-0" />
                          <span>Session traces copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4.5 h-4.5 text-slate-800 shrink-0" />
                          <span>Copy Session tracing logs</span>
                        </>
                      )}
                    </button>
                  </div>

                </motion.div>
              )}

            </AnimatePresence>
          </main>

          {/* ================== LOOP TRANSITION FYI (harvest → landscape) ================== */}
          <AnimatePresence>
            {loopTransition && (
              <motion.div
                initial={{ opacity: 0, y: -24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.45 }}
                className="fixed top-24 left-1/2 -translate-x-1/2 z-[55] w-[min(92vw,30rem)]"
              >
                <div className="bg-slate-900/95 border border-purple-700/50 rounded-2xl shadow-2xl shadow-purple-950/40 backdrop-blur p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-7 h-7 rounded-lg bg-purple-950 border border-purple-700 flex items-center justify-center text-purple-300 text-[10px] font-mono font-extrabold">
                      L{loopTransition.loop}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-purple-300 font-bold">
                      Entering Loop {loopTransition.loop}
                    </span>
                    <span className="ml-auto text-[10px] font-mono text-pink-400 font-bold">+{loopTransition.drift}% drift</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Evidence committed. The problem frame co-evolved to:
                  </p>
                  <p className="text-xs text-white italic mt-1 leading-relaxed">"{loopTransition.frame}"</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ================== WORKSHOP DECISION-POINT OVERLAY ================== */}
          <AnimatePresence>
            {workshopStep && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={closeWorkshop}
              >
                <motion.div
                  initial={{ scale: 0.96, y: 12 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.96, y: 12 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-300">
                        <BookOpen className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-mono uppercase tracking-widest text-indigo-300 font-bold">AI facilitator</span>
                        <h3 className="text-sm font-bold text-white">
                          Prep or debrief your workshop
                        </h3>
                      </div>
                    </div>
                    <button onClick={closeWorkshop} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 px-5 pt-3">
                    <button
                      onClick={() => setWorkshopTab("discuss")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer ${
                        workshopTab === "discuss" ? "bg-indigo-600 text-white" : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                      }`}
                    >
                      AI discussion
                    </button>
                    <button
                      onClick={() => setWorkshopTab("notes")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer ${
                        workshopTab === "notes" ? "bg-indigo-600 text-white" : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                      }`}
                    >
                      Real notes
                    </button>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto px-5 py-4">
                    {workshopTab === "discuss" ? (
                      <div className="flex flex-col gap-3">
                        {workshopMessages.length === 0 && (
                          <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                            Think through your workshop with the AI facilitator — prep questions before, or debrief what happened after. When you hit "Apply", the discussion is sorted automatically: prep points join your brief, findings pre-fill the findings editor, and you get a short recap you can copy.
                          </p>
                        )}
                        {workshopMessages.map((m, i) => (
                          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[11px] leading-relaxed ${
                              m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-950 border border-slate-800 text-slate-200"
                            }`}>
                              {m.content}
                            </div>
                          </div>
                        ))}
                        {workshopBusy && (
                          <div className="flex justify-start">
                            <div className="bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2 text-[11px] text-slate-400 flex items-center gap-2">
                              <RefreshCw className="w-3 h-3 animate-spin" /> Facilitator is thinking…
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-mono text-indigo-300 uppercase tracking-widest mb-1.5 font-bold">
                          Real workshop outcomes / notes
                        </label>
                        <textarea
                          rows={8}
                          value={workshopNotes}
                          onChange={(e) => setWorkshopNotes(e.target.value)}
                          placeholder="What came out of the real workshop? Decisions, observations, quotes… The AI structures this into the step's result."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
                        />
                      </div>
                    )}
                  </div>

                  {/* Footer: chat input (discuss) + apply */}
                  <div className="border-t border-slate-800 px-5 py-3 space-y-3">
                    {workshopTab === "discuss" && (
                      <>
                        {/* Suggested replies — click to continue the discussion */}
                        {!workshopBusy && workshopSuggestions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {workshopSuggestions.map((s, i) => (
                              <button
                                key={i}
                                onClick={() => sendWorkshopMessage(s)}
                                className="text-[10px] text-indigo-200 bg-indigo-950/50 hover:bg-indigo-900/70 border border-indigo-800/60 hover:border-indigo-600 rounded-full px-3 py-1.5 cursor-pointer transition-colors text-left"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={workshopInput}
                            onChange={(e) => setWorkshopInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !workshopBusy) sendWorkshopMessage(); }}
                            placeholder="Type your point and press Enter…"
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            onClick={() => sendWorkshopMessage()}
                            disabled={workshopBusy || !workshopInput.trim()}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-xl text-[10px] font-mono font-bold uppercase cursor-pointer flex items-center gap-1.5"
                          >
                            <ArrowRight className="w-3.5 h-3.5" /> Send
                          </button>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] font-mono text-slate-500">
                        Apply sorts this into prep notes, findings &amp; a recap.
                      </span>
                      <button
                        onClick={applyWorkshop}
                        disabled={isApplyingWorkshop}
                        className="px-5 py-2.5 bg-[#10B981] hover:bg-emerald-500 disabled:opacity-50 text-slate-950 rounded-xl text-[10px] font-mono font-extrabold uppercase tracking-widest cursor-pointer flex items-center gap-2 shrink-0"
                      >
                        {isApplyingWorkshop ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {isApplyingWorkshop ? "Sorting…" : "Apply"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-4 text-center mt-auto font-mono text-[9px] text-slate-600 select-none">
            Coevolve · Frame · Probe · Harvest · Reframe
          </footer>

        </div>
      )}

    </div>
  );
}
