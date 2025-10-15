import * as fs from "fs";
import * as path from "path";
import { LogEntry } from "../types";

class Logger {
  private logFilePath: string;

  constructor() {
    const logsDir = path.join(__dirname, "../../logs");
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
    const logs = fs.readFileSync(this.logFilePath, "utf-8").split("\n");
    return logs.slice(-limit).filter((line) => line.trim() !== "");
  }

  clearLogs(): void {
    if (fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, "");
    }
  }
}

export const logger = new Logger();
