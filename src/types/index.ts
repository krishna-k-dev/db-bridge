// Core types and interfaces

export interface SQLConnection {
  id: string;
  name: string;
  server: string;
  database: string;
  user?: string;
  password?: string;
  port?: number;
  options?: {
    trustServerCertificate?: boolean;
    encrypt?: boolean;
    [key: string]: any;
  };
  createdAt?: Date;
  lastTested?: Date;
}

export interface Job {
  id: string;
  name: string;
  enabled: boolean;
  connectionId: string; // Reference to SQLConnection by ID
  query: string;
  schedule: string; // cron expression or interval in minutes (e.g., "*/2 * * * *" or "2m")
  trigger: "always" | "onChange";
  lastRun?: Date;
  lastHash?: string;
  destinations: Destination[];
}

export interface Destination {
  type: string; // 'webhook' | 'google_sheets' | 'custom_api'
  [key: string]: any;
}

export interface WebhookDestination extends Destination {
  type: "webhook";
  url: string;
  method?: "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  batchSize?: number;
}

export interface GoogleSheetsDestination extends Destination {
  type: "google_sheets";
  spreadsheetId: string;
  sheetName: string;
  mode: "append" | "replace" | "update";
  keyColumn?: string; // for update mode
  credentialsPath?: string; // deprecated - for backward compatibility
  credentialsJson?: string; // new - JSON string directly pasted
}

export interface CustomAPIDestination extends Destination {
  type: "custom_api";
  url: string;
  method?: "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  batchSize?: number;
}

export interface ExcelDestination extends Destination {
  type: "excel";
  filePath: string;
  sheetName?: string;
  mode?: "append" | "replace";
}

export interface CSVDestination extends Destination {
  type: "csv";
  filePath: string;
  mode?: "append" | "replace";
  delimiter?: string;
  includeHeaders?: boolean;
}

export interface JobMeta {
  jobId: string;
  jobName: string;
  runTime: Date;
  rowCount: number;
}

export interface SendResult {
  success: boolean;
  message: string;
  error?: any;
}

export interface DestinationAdapter {
  name: string;
  send(data: any[], config: Destination, meta: JobMeta): Promise<SendResult>;
}

export interface AppConfig {
  connections: SQLConnection[];
  jobs: Job[];
}

export interface LogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error";
  jobId?: string;
  message: string;
  data?: any;
}
