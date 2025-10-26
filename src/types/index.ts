// Core types and interfaces

export interface SQLConnection {
  id: string;
  name: string;
  server: string;
  database: string;
  user?: string;
  password?: string;
  port?: number;
  financialYear?: string;
  group?: "self" | "partner";
  partner?: string;
  options?: {
    trustServerCertificate?: boolean;
    encrypt?: boolean;
    [key: string]: any;
  };
  createdAt?: Date;
  lastTested?: Date;
  testStatus?: "connected" | "failed" | "not-tested";
}

export interface Job {
  id: string;
  name: string;
  enabled: boolean;
  connectionId?: string; // For backward compatibility
  connectionIds?: string[]; // New field for multiple connections
  query: string;
  schedule: string; // cron expression or interval in minutes (e.g., "*/2 * * * *" or "2m")
  recurrenceType?: "once" | "daily" | "every-n-days"; // New field for recurrence type
  everyNDays?: number; // For every-n-days recurrence
  timeOfDay?: string; // HH:MM format for daily/every-n-days jobs
  trigger: "always" | "onChange";
  lastRun?: Date;
  lastHash?: string;
  destinations: Destination[];
  group?: string;
}

export interface AppSettings {
  defaultQueryTimeout?: number; // in seconds
  defaultConnectionTimeout?: number; // in seconds
  partners: string[]; // list of partner names
  financialYears: string[]; // list of financial years
  jobGroups: string[]; // list of job group names
  [key: string]: any;
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
  jobGroup?: string;
  runTime: Date;
  rowCount: number;
  connectionId?: string;
  connectionName?: string;
}

export interface SendResult {
  success: boolean;
  message: string;
  error?: any;
}

export interface DestinationAdapter {
  name: string;
  send(data: any[], config: Destination, meta: JobMeta): Promise<SendResult>;
  // Optional: Multi-connection support
  sendMultiConnection?(
    dataWithMeta: Array<{
      connection: any;
      data: any[];
      connectionFailedMessage?: string;
    }>,
    config: Destination,
    meta: { jobId: string; jobName: string; runTime: Date }
  ): Promise<SendResult>;
}

export interface AppConfig {
  connections: SQLConnection[];
  jobs: Job[];
  settings: AppSettings;
}

export interface LogEntry {
  timestamp: Date;
  level: "info" | "warn" | "error";
  jobId?: string;
  message: string;
  data?: any;
}
