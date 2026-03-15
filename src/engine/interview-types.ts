export interface InterviewPhase {
  name: string;
  instructions: string;
}

export interface InterviewConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  phases: InterviewPhase[];
  artifactTemplate: string;
  guardrails: string[];
  outputFile?: string;
  /** When true, Claude can explore the codebase via read_file, list_files, search_files, read_pdf tools */
  enableTools?: boolean;
  /** Max tool loop iterations per turn. Default: 15 */
  maxToolLoops?: number;
  /**
   * Auto-continue discovery phases. Each entry is a prompt sent automatically
   * after the previous tool turn completes, giving Claude a fresh 15-tool budget
   * per phase. The user is only prompted after all discovery phases finish.
   */
  discoveryPhases?: string[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface InterviewResult {
  artifact: string;
  transcript: Message[];
  config: InterviewConfig;
}
