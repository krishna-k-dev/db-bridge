import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { LogEntry } from "../types";

class Logger {
  private logFilePath: string;

  constructor() {
    // Use app.getPath('userData') for packaged app
    const userDataPath = app.getPath("userData");
    const logsDir = path.join(userDataPath, "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.logFilePath = path.join(logsDir, "app.log");
  }

  private writeLog(entry: LogEntry): void {
    const logLine = `[${entry.timestamp.toISOString()}] [${entry.level.toUpperCase()}] ${
      entry.jobId ? `[${entry.jobId}] ` : ""
    }${entry.message}${entry.data ? " | " + JSON.stringify(entry.data) : ""}\n`;

    fs.appendFileSync(this.logFilePath, logLine);

    // Also log to console
    console.log(logLine.trim());
  }

  info(message: string, jobId?: string, data?: any): void {
    this.writeLog({
      timestamp: new Date(),
      level: "info",
      jobId,
      message,
      data,
    });
  }

  warn(message: string, jobId?: string, data?: any): void {
    this.writeLog({
      timestamp: new Date(),
      level: "warn",
      jobId,
      message,
      data,
    });
  }

  error(message: string, jobId?: string, data?: any): void {
    this.writeLog({
      timestamp: new Date(),
      level: "error",
      jobId,
      message,
      data,
    });
  }

  getLogs(limit: number = 100): string[] {
    if (!fs.existsSync(this.logFilePath)) {
      return [];
    }
    
    try {
      const stats = fs.statSync(this.logFilePath);
      const fileSize = stats.size;
      
      // If file is too large (> 10MB), read only last portion
      if (fileSize > 10 * 1024 * 1024) {
        const bufferSize = Math.min(fileSize, 500 * 1024); // Read last 500KB
        const buffer = Buffer.alloc(bufferSize);
        const fd = fs.openSync(this.logFilePath, 'r');
        fs.readSync(fd, buffer, 0, bufferSize, fileSize - bufferSize);
        fs.closeSync(fd);
        
        const logs = buffer.toString('utf-8').split('\n');
        return logs.slice(-limit).filter((line) => line.trim() !== "");
      }
      
      // For smaller files, read normally
      const logs = fs.readFileSync(this.logFilePath, "utf-8").split("\n");
      return logs.slice(-limit).filter((line) => line.trim() !== "");
    } catch (error) {
      console.error('Error reading logs:', error);
      return [`Error reading logs: ${error instanceof Error ? error.message : String(error)}`];
    }
  }

  clearLogs(): void {
    if (fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, "");
    }
  }
}

export const logger = new Logger();
