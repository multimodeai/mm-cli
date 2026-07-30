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
  failure_modes?: string[];
  /**
   * VOID-rule canary checks. If any of these qualities is missed, the entire
   * scenario score is marked VOID (not zero — VOID is distinct, signalling
   * "model didn't find what a careful analyst would find"). Implements the
   * private-benchmarks SKILL.md canary methodology: a material fact existing
   * only in a source requiring active effort (DB query, hidden column, etc.).
   */
  canary_qualities?: string[];
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
  /**
   * When true, the runner uses sendWithTools() so the candidate model has access
   * to read_file / list_files / search_files / read_pdf / git_info / list_directory.
   * Required for benchmarks whose corpus lives on disk. Default false (no tools).
   * Public-facing skill demos should keep this false.
   */
  enable_tools?: boolean;
  /**
   * Which tool set the candidate is given when enable_tools is true.
   * Used by the tool-pruning ablation (Vercel/Nate "fewer tools → better output").
   *   - 'full'    (default) → CODEBASE_TOOLS — today's behavior, unchanged.
   *   - 'pruned'  → only the minimal file-discovery subset the corpus task needs.
   *   - 'bloated' → CODEBASE_TOOLS + ~15 plausible-but-irrelevant distractor tools.
   * Default 'full' so all existing suites are unaffected.
   */
  tool_set?: 'pruned' | 'full' | 'bloated';
}

export interface ScenarioResult {
  scenario: string;
  response: string;
  qualityScore: number;
  qualityDetails: { quality: string; met: boolean; reason: string }[];
  failureModeHits: { mode: string; hit: boolean; reason: string }[];
  manifoldScore?: ManifoldScore;
  manifoldTotal?: number;
  /** Canary-quality results — populated only when eval.yaml defines canary_qualities */
  canaryChecks?: { canary: string; met: boolean; reason: string }[];
  /** True if ANY canary quality was missed → score reads as VOID, not the raw qualityScore */
  isVoid?: boolean;
  /** Human-readable reason the result is VOID (which canary was missed) */
  voidReason?: string;
  /** Tool-pruning ablation instrumentation (populated only when enable_tools) */
  toolUsage?: ToolUsageStats;
}

/**
 * Per-scenario tool-call telemetry for the tool-pruning ablation.
 * wrongToolRate = distractorCalls / totalCalls (the headline "selection confusion"
 * metric); steps = totalCalls (tool-loop iterations to completion).
 */
export interface ToolUsageStats {
  toolSet: 'pruned' | 'full' | 'bloated';
  totalCalls: number;
  distractorCalls: number;
  /** distractorCalls / totalCalls, 0 when no calls were made */
  wrongToolRate: number;
  /** Ordered list of every tool name the model called */
  callSequence: string[];
  /** name → count, for quick inspection */
  callCounts: Record<string, number>;
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
  effort?: 'low' | 'medium' | 'high' | 'max' | 'ultracode';
}
