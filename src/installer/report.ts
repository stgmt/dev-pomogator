import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface InstallReportEntry {
  component: string;
  status: 'ok' | 'warn' | 'fail';
  message?: string;
}

export class InstallReport {
  private entries: InstallReportEntry[] = [];

  add(entry: InstallReportEntry): void {
    this.entries.push(entry);
  }

  async write(): Promise<void> {
    const configDir = path.join(os.homedir(), '.dev-pomogator');
    const reportPath = path.join(configDir, 'last-install-report.md');

    const timestamp = new Date().toISOString();
    const lines: string[] = [
      '# Install Report',
      '',
      `Generated: ${timestamp}`,
      '',
      '| Component | Status | Details |',
      '|-----------|--------|---------|',
    ];

    for (const entry of this.entries) {
      const details = entry.message ? entry.message.split('\n')[0].slice(0, 200) : '';
      lines.push(`| ${entry.component} | ${entry.status} | ${details} |`);
    }

    lines.push('');

    await fs.ensureDir(configDir);
    const tmpPath = reportPath + '.tmp';
    await fs.writeFile(tmpPath, lines.join('\n'), 'utf-8');
    await fs.move(tmpPath, reportPath, { overwrite: true });
  }
}
