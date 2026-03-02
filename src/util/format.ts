import chalk from 'chalk';

export function table(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] || '').length), 0);
    return Math.max(h.length, maxData);
  });

  const divider = colWidths.map(w => '─'.repeat(w + 2)).join('┼');
  const headerLine = headers.map((h, i) => ` ${h.padEnd(colWidths[i])} `).join('│');
  const dataLines = rows.map(row =>
    row.map((cell, i) => ` ${(cell || '').padEnd(colWidths[i])} `).join('│')
  );

  return [
    headerLine,
    divider,
    ...dataLines,
  ].join('\n');
}

export function heading(text: string): string {
  return chalk.bold.cyan(`\n${text}\n${'─'.repeat(text.length)}`);
}

export function success(text: string): string {
  return chalk.green(`✓ ${text}`);
}

export function warn(text: string): string {
  return chalk.yellow(`⚠ ${text}`);
}

export function error(text: string): string {
  return chalk.red(`✗ ${text}`);
}

export function dim(text: string): string {
  return chalk.dim(text);
}
