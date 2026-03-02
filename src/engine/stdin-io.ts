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

  async prompt(message?: string): Promise<string> {
    if (this.closed) {
      throw new Error('Input stream closed');
    }

    if (message) {
      console.log(message);
    }
    console.log();

    return new Promise<string>((resolve, reject) => {
      this.rl.question(chalk.cyan('You: '), (answer) => {
        if (answer === undefined) {
          reject(new Error('Input stream closed'));
        } else {
          resolve(answer);
        }
      });
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
