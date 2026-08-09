import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import type { ClaudeClient } from './claude-client.js';
import { writeArtifact } from './artifact-writer.js';

const MAX_BUFFER = 1024 * 1024 * 50; // 50MB — a long review session's poll output can run long

/**
 * Open a generated artifact in Lavish for interactive browser review, then loop:
 * poll for the user's feedback -> ask Claude to revise the full document ->
 * rewrite the artifact -> poll again. Ends when the user ends the Lavish session.
 *
 * Invoked via `npx -y lavish-axi` — a subprocess call, not a package.json dependency.
 * Requires Node >=22 and a local browser; failures here are non-fatal (the artifact
 * is already saved to disk before this runs).
 */
export async function runLavishReview(
  outputFile: string,
  client: ClaudeClient,
  artifactStartMarker: string | undefined
): Promise<void> {
  console.log(chalk.cyan(`\nOpening ${outputFile} in Lavish for review...`));

  try {
    execFileSync('npx', ['-y', 'lavish-axi', outputFile], { stdio: 'inherit' });
  } catch (err) {
    console.log(chalk.yellow('\nCould not launch Lavish (requires Node >=22, npx, and a local browser). Skipping review — your spec is saved.'));
    console.log(chalk.dim(String((err as Error)?.message || err)));
    return;
  }

  let agentReply = 'Generated the initial spec from your description. Let me know what to change.';

  for (;;) {
    let pollOutput: string;
    try {
      pollOutput = execFileSync(
        'npx',
        ['-y', 'lavish-axi', 'poll', outputFile, '--agent-reply', agentReply],
        { encoding: 'utf-8', maxBuffer: MAX_BUFFER }
      );
    } catch (err) {
      console.log(chalk.yellow('\nLavish review loop stopped (poll failed or was interrupted). Your spec is saved as-is.'));
      console.log(chalk.dim(String((err as Error)?.message || err)));
      return;
    }

    if (pollOutput.includes('session_ended: true')) {
      console.log(chalk.green('\nReview session ended. Final spec saved.'));
      return;
    }

    console.log(chalk.dim('\nApplying your Lavish feedback...'));

    const currentContent = readFileSync(outputFile, 'utf-8');
    const revisionPrompt = `Here is the current specification:\n\n---\n${currentContent}\n---\n\nHere is the raw feedback from the Lavish review session (it references specific parts of the document by their text — read it and figure out what the user wants changed):\n\n---\n${pollOutput}\n---\n\nRevise the FULL specification to address this feedback. Output the complete updated specification, starting with the "=== PROJECT SPECIFICATION ===" marker line — never a diff or partial update.`;

    const revised = await client.send(
      'You are revising a specification document based on structured review feedback from a Lavish session. Always output the COMPLETE revised document, never a diff or partial update. Keep the "=== PROJECT SPECIFICATION ===" marker as the first line.',
      [{ role: 'user', content: revisionPrompt }],
      16000
    );

    writeArtifact(outputFile, revised, artifactStartMarker);
    agentReply = 'Applied your feedback and updated the spec. Let me know if anything else needs changing.';
  }
}

function kayaInvocation(): { command: string; prefix: string[] } {
  const configured = process.env.KAYA_BIN;
  if (configured) return { command: configured, prefix: [] };
  const localBin = resolve(dirname(fileURLToPath(import.meta.url)), '../../kaya-editor/bin/kaya.js');
  return existsSync(localBin)
    ? { command: process.execPath, prefix: [localBin] }
    : { command: 'kaya', prefix: [] };
}

/**
 * KAYA-backed equivalent of runLavishReview. It deliberately keeps the same
 * signature and non-fatal behavior so the spec command can switch engines.
 */
export async function runKayaReview(
  outputFile: string,
  client: ClaudeClient,
  artifactStartMarker: string | undefined
): Promise<void> {
  const kaya = kayaInvocation();
  console.log(chalk.cyan(`\nOpening ${outputFile} in Kaya for review...`));

  try {
    execFileSync(kaya.command, [...kaya.prefix, outputFile], { stdio: 'inherit' });
  } catch (err) {
    console.log(chalk.yellow('\nCould not launch Kaya. Skipping review - your spec is saved.'));
    console.log(chalk.dim(String((err as Error)?.message || err)));
    return;
  }

  let agentReply = 'Generated the initial spec from your description. Let me know what to change.';

  for (;;) {
    let pollOutput: string;
    try {
      pollOutput = execFileSync(
        kaya.command,
        [...kaya.prefix, 'poll', outputFile, '--agent-reply', agentReply],
        { encoding: 'utf-8', maxBuffer: MAX_BUFFER }
      );
    } catch (err) {
      console.log(chalk.yellow('\nKaya review loop stopped (poll failed or was interrupted). Your spec is saved as-is.'));
      console.log(chalk.dim(String((err as Error)?.message || err)));
      return;
    }

    if (pollOutput.includes('session_ended: true')) {
      console.log(chalk.green('\nReview session ended. Final spec saved.'));
      return;
    }

    // A bounded poll returns a keep-alive with no feedback text - just re-poll,
    // don't revise the spec against nothing.
    const feedbackText = pollOutput.replace(/session_ended:[\s\S]*$/, '').trim();
    if (!feedbackText) {
      agentReply = 'Still here - annotate anything and Send to Agent when ready.';
      continue;
    }

    console.log(chalk.dim('\nApplying your Kaya feedback...'));
    const currentContent = readFileSync(outputFile, 'utf-8');
    const revisionPrompt = `Here is the current specification:\n\n---\n${currentContent}\n---\n\nHere is the raw feedback from the Kaya review session (it references specific parts of the document by their text - read it and figure out what the user wants changed):\n\n---\n${pollOutput}\n---\n\nRevise the FULL specification to address this feedback. Output the complete updated specification, starting with the "=== PROJECT SPECIFICATION ===" marker line - never a diff or partial update.`;

    const revised = await client.send(
      'You are revising a specification document based on structured review feedback from a Kaya session. Always output the COMPLETE revised document, never a diff or partial update. Keep the "=== PROJECT SPECIFICATION ===" marker as the first line.',
      [{ role: 'user', content: revisionPrompt }],
      16000
    );

    writeArtifact(outputFile, revised, artifactStartMarker);
    agentReply = 'Applied your feedback and updated the spec. Let me know if anything else needs changing.';
  }
}
