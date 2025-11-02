// Electron IPC Types
export interface ElectronAPI {
  // Window controls
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;

  // Connections
  getConnections: () => Promise<Connection[]>;
  addConnection: (data: ConnectionInput) => Promise<Connection>;
  updateConnection: (
    id: string,
    data: Partial<ConnectionInput>
  ) => Promise<Connection>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (
    id: string
  ) => Promise<{ success: boolean; message: string }>;
  bulkTestConnections: (
    ids: string[]
  ) => Promise<
    Array<{ connectionId: string; success: boolean; message: string }>
  >;
  bulkUploadConnections: (
    file: File
  ) => Promise<{ success: number; failed: number }>;

  // Jobs
  getJobs: () => Promise<Job[]>;
  addJob: (data: JobInput) => Promise<Job>;
  updateJob: (id: string, data: Partial<JobInput>) => Promise<Job>;
  deleteJob: (id: string) => Promise<void>;
  runJob: (id: string) => Promise<void>;
  pauseJob: (id: string) => Promise<void>;

  // Logs
  getLogs: (filter?: LogFilter) => Promise<LogEntry[]>;
  clearLogs: () => Promise<void>;
  exportLogs: () => Promise<void>;

  // Settings
  getSettings: () => Promise<AppSettings>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
}

// Extend Window interface
declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

// System User Types
export interface SystemUser {
  name: string;
  number: string;
  group: string;
}

// WhatsApp Group Types
export interface WhatsAppGroup {
  name: string;
  groupId: string;
}

// Connection Types
export interface Store {
  name: string;
  shortName: string;
}

export interface Connection {
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
  store?: string; // Store short name
  options?: {
    trustServerCertificate?: boolean;
    encrypt?: boolean;
    [key: string]: any;
  };
  createdAt?: Date;
  lastTested?: Date;
  testStatus?: "connected" | "failed" | "not-tested";
}

export interface ConnectionInput {
  name: string;
  server: string;
  database: string;
  user: string;
  password: string;
  port?: number;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

// Job Types
export type JobDestinationType =
  | "webhook"
  | "google-sheets"
  | "excel"
  | "csv"
  | "custom-api";
export type JobTriggerType = "manual" | "cron" | "interval" | "startup";
export type JobStatus = "running" | "stopped" | "scheduled" | "paused";

export interface Job {
  id: string;
  name: string;
  description?: string;
  connectionId: string;
  query: string;
  destinationType: JobDestinationType;
  destinationConfig: Record<string, any>;
  triggerType: JobTriggerType;
  schedule?: string;
  interval?: number;
  status: JobStatus;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
  group?: string;

  // Populated fields
  connection?: Connection;
}

export interface JobInput {
  name: string;
  description?: string;
  connectionId: string;
  query: string;
  destinationType: JobDestinationType;
  destinationConfig: Record<string, any>;
  triggerType: JobTriggerType;
  schedule?: string;
  interval?: number;
}

// Log Types
export type LogLevel = "info" | "success" | "warning" | "error" | "debug";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  job?: string;
  jobId?: string;
  connection?: string;
  connectionId?: string;
  details?: any;
}

export interface LogFilter {
  level?: LogLevel | "all";
  jobId?: string;
  connectionId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

// Settings Types
export interface AppSettings {
  general: {
    appName: string;
    logLevel: LogLevel;
    autoStart: boolean;
    minimizeToTray: boolean;
  };
  database: {
    connectionTimeout: number;
    queryTimeout: number;
    maxRetries: number;
    retryDelay: number;
  };
  notifications: {
    jobSuccess: boolean;
    jobError: boolean;
    connectionError: boolean;
    soundEnabled: boolean;
  };
  advanced: {
    enableDebugMode: boolean;
    logFileMaxSize: number;
    logRetentionDays: number;
  };
}

// UI Component Props Types
export interface PageProps {
  onCountChange?: (count: number) => void;
}

export interface SidebarProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
  connectionsCount: number;
  jobsCount: number;
}

export type PageType = "connections" | "jobs" | "logs" | "settings";

// Pagination Types
export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

// Table Types
export interface SortState {
  column: string;
  direction: "asc" | "desc";
}

export interface FilterState {
  search: string;
  status?: string;
  type?: string;
}

// Form Types
export interface FormErrors {
  [key: string]: string;
}

export interface FormState<T> {
  data: T;
  errors: FormErrors;
  isSubmitting: boolean;
  isDirty: boolean;
}

// Modal Types
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: () => void;
  title?: string;
}

// Bulk Upload Types
export interface BulkUploadResult {
  success: number;
  failed: number;
  errors?: Array<{
    row: number;
    error: string;
  }>;
}

// Export Types
export interface ExportOptions {
  format: "csv" | "json" | "excel";
  filename?: string;
  includeHeaders?: boolean;
}
