export type CardType = "opportunity" | "solution" | "uncertainty";

export interface LandscapeCard {
  id: string;
  type: CardType;
  title: string;
  description: string;
  extraLabel?: string; // concept seed, crucial question, trigger
  rating: "high" | "medium" | "low";
  justification?: string;
  isWildCard?: boolean; // Surprise card
  retired?: boolean;
}

export interface ProbeFamily {
  title: string;
  description: string;
  seed: string; // Dynamic test idea
}

export interface Finding {
  id: string;
  title: string;
  description: string;
}

export interface Evidence {
  id: string;
  loopIndex: number;
  sourceProbeTitle: string;
  findings: Finding[];
  timestamp: number;
}

export interface LoopHistory {
  loopIndex: number;
  problemFrame: string;
  selectedOpportunity: LandscapeCard;
  selectedSolution: LandscapeCard;
  selectedUncertainty: LandscapeCard;
  probe: ProbeFamily;
  findings: Finding[];
  reframeDrift: number; // calculated cognitive drift from start
}

export interface GameState {
  loopIndex: number;
  problemFrame: string;
  initialProblemFrame: string;
  evidenceLog: Evidence[];
  activeOpportunityCards: LandscapeCard[];
  activeSolutionCards: LandscapeCard[];
  activeUncertaintyCards: LandscapeCard[];
  selectedOpportunity: string | null; // ID elements
  selectedSolution: string | null;
  selectedUncertainty: string | null;
  justifications: { [cardId: string]: string };
  probe: ProbeFamily | null;
  findings: Finding[];
  reframeDrift: number; // drift meter%
  history: LoopHistory[];
}
