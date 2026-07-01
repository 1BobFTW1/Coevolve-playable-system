export interface GamePreset {
  id: string;
  label: string;
  designingFor: string;
  observations: string;
  defaultProblemFrame: string;
}

export const gamePresets: GamePreset[] = [
  {
    id: "preset-student-ai",
    label: "Student AI Workflows",
    designingFor: "University Students & Professors",
    observations: "Students copy-paste 100% LLM outputs without reading, faking human text to bypass AI detectors. They spend hours prompting instead of deep thinking.",
    defaultProblemFrame: "Co-Learning Milestone: Competence is fine, but verification feels like punishment, not help."
  },
  {
    id: "preset-screen-time",
    label: "Digital Well-being scrollers",
    designingFor: "Late-night feed scrollers",
    observations: "Infinite vertical feeds remove natural transition triggers. Micro-vibrations keep checking attention fully locked even when idle.",
    defaultProblemFrame: "Extraction Autoplay: Vertical scrolls hijack human visual pauses before natural self-reflection can settle."
  },
  {
    id: "preset-med-alerts",
    label: "Healthcare Delivery Fatigue",
    designingFor: "ICU night-shift nurses",
    observations: "Monitors chime 120 times/hour for minor updates, inducing alert fatigue. Yellow tints are identical for life-critical vs regular checks.",
    defaultProblemFrame: "Chiming Ambient Overload: Homogenous notification audio cancels critical warnings in ICU rooms."
  }
];

export const emptyPreset: GamePreset = {
  id: "preset-custom",
  label: "Custom Design Sprint",
  designingFor: "Early Adopters / Target Users",
  observations: "Manual research data detailing how users operate under extreme stress, work bottlenecks, and behavioral barriers.",
  defaultProblemFrame: "Critical Disconnect: Existing systems prioritize throughput, overlooking raw human friction."
};
