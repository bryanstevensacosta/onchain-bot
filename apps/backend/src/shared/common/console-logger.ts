import * as fs from 'fs';
import * as path from 'path';

export class ConsoleLogger {
  private logFilePath: string;
  private maxFileSize: number;
  private rotationCount = 0;

  constructor(logFileName: string = 'e2e-test.log', maxFileSizeMB: number = 2) {
    const logsDir = path.join(process.cwd(), 'logs');

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.logFilePath = path.join(logsDir, logFileName);
    this.maxFileSize = maxFileSizeMB * 1024 * 1024;
  }

  private shouldRotate(): boolean {
    try {
      const stats = fs.statSync(this.logFilePath);
      return stats.size >= this.maxFileSize;
    } catch {
      return false;
    }
  }

  private rotateLog(): void {
    if (this.shouldRotate()) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedFileName = `e2e-test-${timestamp}-${this.rotationCount}.log`;
      const rotatedPath = path.join(
        path.dirname(this.logFilePath),
        rotatedFileName,
      );

      fs.renameSync(this.logFilePath, rotatedPath);
      this.rotationCount++;

      // Keep only last 5 rotated files
      this.cleanOldRotatedFiles();
    }
  }

  private cleanOldRotatedFiles(): void {
    const logsDir = path.dirname(this.logFilePath);
    const files = fs
      .readdirSync(logsDir)
      .filter((f) => f.startsWith('e2e-test-') && f.endsWith('.log'))
      .map((f) => ({
        name: f,
        path: path.join(logsDir, f),
        mtime: fs.statSync(path.join(logsDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    // Remove old rotated files, keep only 5
    files.slice(5).forEach((f) => {
      try {
        fs.unlinkSync(f.path);
      } catch {
        // Ignore errors when deleting old files
      }
    });
  }

  private formatMessage(
    level: string,
    message: string,
    data?: unknown,
  ): string {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (data !== undefined) {
      try {
        logEntry += ` | ${JSON.stringify(data)}`;
      } catch {
        logEntry += ` | [unserializable data]`;
      }
    }

    return logEntry;
  }

  log(message: string, data?: unknown): void {
    this.rotateLog();
    const entry = this.formatMessage('info', message, data);
    fs.appendFileSync(this.logFilePath, entry + '\n');
    console.log(entry);
  }

  warn(message: string, data?: unknown): void {
    this.rotateLog();
    const entry = this.formatMessage('warn', message, data);
    fs.appendFileSync(this.logFilePath, entry + '\n');
    console.warn(entry);
  }

  error(message: string, data?: unknown): void {
    this.rotateLog();
    const entry = this.formatMessage('error', message, data);
    fs.appendFileSync(this.logFilePath, entry + '\n');
    console.error(entry);
  }

  debug(message: string, data?: unknown): void {
    this.rotateLog();
    const entry = this.formatMessage('debug', message, data);
    fs.appendFileSync(this.logFilePath, entry + '\n');
    console.debug(entry);
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }

  clear(): void {
    try {
      fs.unlinkSync(this.logFilePath);
    } catch {
      // File doesn't exist, that's fine
    }
  }
}

// Singleton instance
export const consoleLogger = new ConsoleLogger('e2e-test.log', 2);
