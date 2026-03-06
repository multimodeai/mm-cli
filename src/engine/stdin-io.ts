import { createInterface, type Interface } from 'node:readline';
import chalk from 'chalk';

export class StdinIO {
  private rl: Interface;
  private closed = false;

  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rl.on('close', () => {
      this.closed = true;
    });
  }

  /**
   * Prompt the user for input. Supports multi-line paste: lines arriving
   * in rapid succession (< 50ms apart) are buffered and joined with \n.
   * A single typed Enter still submits immediately.
   */
  async prompt(message?: string): Promise<string> {
    if (this.closed) {
      throw new Error('Input stream closed');
    }

    if (message) {
      console.log(message);
    }
    console.log();

    process.stdout.write(chalk.cyan('You: '));

    return new Promise<string>((resolve, reject) => {
      const lines: string[] = [];
      let timer: ReturnType<typeof setTimeout> | null = null;
      const PASTE_WAIT_MS = 50;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.rl.removeListener('line', onLine);
        this.rl.removeListener('close', onClose);
      };

      const onLine = (line: string) => {
        lines.push(line);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          cleanup();
          resolve(lines.join('\n'));
        }, PASTE_WAIT_MS);
      };

      const onClose = () => {
        cleanup();
        if (lines.length > 0) {
          resolve(lines.join('\n'));
        } else {
          reject(new Error('Input stream closed'));
        }
      };

      this.rl.on('line', onLine);
      this.rl.on('close', onClose);
    });
  }

  printAssistant(text: string): void {
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log(text);
    console.log(chalk.dim('─'.repeat(60)));
  }

  close(): void {
    if (!this.closed) {
      this.rl.close();
      this.closed = true;
    }
  }
}
