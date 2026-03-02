export interface ManifoldScore {
  selectiveTransfer: number;      // 1-3: What still holds vs needs revision?
  causalTransparency: number;     // 1-3: Can it explain WHY?
  creativeRerouting: number;      // 1-3: Finds alternatives when blocked?
  degradationAwareness: number;   // 1-3: Flags harder/impossible?
  outputCoherence: number;        // 1-3: Satisfies original + new constraint?
}

export interface EvalScenario {
  name: string;
  prompt: string;
  context?: string;
  expected_qualities: string[];
  failure_modes: string[];
  scoring: {
    excellent: number;
    acceptable: number;
    poor: number;
  };
  // Multi-axis scoring fields (optional — only for constraint-shift scenarios)
  base_scenario?: string;
  constraint_change?: string;
  manifold_dimensions?: {
    selective_transfer?: string;
    causal_transparency?: string;
    creative_rerouting?: string;
    degradation_awareness?: string;
    output_coherence?: string;
  };
}

export interface EvalSuite {
  name: string;
  skill: string;
  model: string;
  judge: string;
  scenarios: EvalScenario[];
}

export interface ScenarioResult {
  scenario: string;
  response: string;
  qualityScore: number;
  qualityDetails: { quality: string; met: boolean; reason: string }[];
  failureModeHits: { mode: string; hit: boolean; reason: string }[];
  manifoldScore?: ManifoldScore;
  manifoldTotal?: number;
}

export interface EvalResult {
  suite: string;
  skill: string;
  model: string;
  withSkill: boolean;
  timestamp: string;
  scenarios: ScenarioResult[];
  totalScore: number;
  maxScore: number;
}
