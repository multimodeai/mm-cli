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
  /** When true, Claude can explore the codebase via read_file, list_files, search_files tools */
  enableTools?: boolean;
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
