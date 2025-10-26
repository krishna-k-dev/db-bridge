import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as remoteMain from "@electron/remote/main";
import * as path from "path";
import * as fs from "fs";
import { JobScheduler } from "./core/scheduler";
import { logger } from "./core/logger";
import { Job } from "./types";
import { ProgressStream } from "./core/ProgressStream";
import { ConnectionPoolManager } from "./connectors/ConnectionPoolManager";
import { JobQueue } from "./core/JobQueue";

let mainWindow: BrowserWindow | null = null;
let splash: BrowserWindow | null = null;
let scheduler: JobScheduler;
let progressStream: ProgressStream;
let connectionPoolManager: ConnectionPoolManager;
let jobQueue: JobQueue;

// Job history storage
interface JobExecutionHistory {
  id: string;
  jobId: string;
  jobName: string;
  status: "completed" | "failed" | "running";
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  totalConnections: number;
  completedConnections: number;
  failedConnections: number;
  errors?: string[];
  result?: any;
  // Optional per-connection details for retrying failed connections
  connectionDetails?: Array<{
    connectionId: string;
    connectionName: string;
    status: string;
    error?: string | null;
  }>;
}

let jobHistory: JobExecutionHistory[] = [];
const jobHistoryPath = path.join(app.getPath("userData"), "job-history.json");

// Load job history from disk
function loadJobHistory() {
  try {
    if (fs.existsSync(jobHistoryPath)) {
      const data = fs.readFileSync(jobHistoryPath, "utf-8");
      jobHistory = JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load job history:", error);
    jobHistory = [];
  }
}

// Save job history to disk
function saveJobHistory() {
  try {
    fs.writeFileSync(jobHistoryPath, JSON.stringify(jobHistory, null, 2));
  } catch (error) {
    console.error("Failed to save job history:", error);
  }
}

// Add or update job in history
function addJobToHistory(jobRecord: JobExecutionHistory) {
  // Find existing record for this job
  const existingIndex = jobHistory.findIndex(
    (h) => h.jobId === jobRecord.jobId
  );

  if (existingIndex !== -1) {
    // Update existing record
    jobHistory[existingIndex] = jobRecord;
  } else {
    // Add new record to beginning
    jobHistory.unshift(jobRecord);
  }

  // Keep only last 1000 records
  if (jobHistory.length > 1000) {
    jobHistory = jobHistory.slice(0, 1000);
  }
  saveJobHistory();

  // Notify renderer
  if (mainWindow) {
    mainWindow.webContents.send("job:history:updated");
  }
}

function createSplash(): void {
  splash = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: "#667eea",
    show: true,
    icon: path.join(app.getAppPath(), "build/icon.ico"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  splash.loadFile(path.join(app.getAppPath(), "src/renderer/splash.html"));

  splash.on("closed", () => {
    splash = null;
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // frameless mat rakho jab tak zarurat na ho
    transparent: false, // transparent false rakho
    show: false, // Don't show until ready
    icon: path.join(app.getAppPath(), "build/icon.ico"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Enable remote for this window
  remoteMain.enable(mainWindow.webContents);

  // Load from Vite dev server in development, otherwise from built files
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), "src/renderer/index.html"));
  }

  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      if (splash) {
        splash.close();
        splash = null;
      }
      mainWindow!.show();

      // Set mainWindow for progress streaming after window is ready
      if (progressStream) {
        progressStream.setMainWindow(mainWindow);
      }
    }, 2000); // 2000 milliseconds = 2 seconds
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  // Initialize @electron/remote
  remoteMain.initialize();

  // Load job history
  loadJobHistory();

  // Initialize core services
  progressStream = ProgressStream.getInstance();
  connectionPoolManager = ConnectionPoolManager.getInstance();
  jobQueue = JobQueue.getInstance();

  // Listen for job completions to add to history
  progressStream.on("job:finished", (data: any) => {
    const { jobId, status, progress, result, error, duration } = data;
    // Extract connection-level details (if available) for retry UI
    let connectionDetails: Array<any> | undefined = undefined;
    try {
      const cp = progress.connectionProgress as Map<string, any> | undefined;
      if (cp && typeof cp === "object") {
        connectionDetails = Array.from((cp as Map<string, any>).values()).map(
          (c: any) => ({
            connectionId: c.connectionId,
            connectionName: c.connectionName,
            status: c.status,
            error: c.error || null,
          })
        );
      }
    } catch (e) {
      connectionDetails = undefined;
    }

    const historyRecord: JobExecutionHistory = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      jobId,
      jobName: progress.jobName,
      status,
      startedAt: progress.startedAt,
      completedAt: progress.completedAt,
      duration,
      totalConnections: progress.totalConnections,
      completedConnections: progress.completedConnections,
      failedConnections: progress.failedConnections,
      errors: progress.errors,
      result,
      connectionDetails,
    };

    addJobToHistory(historyRecord);
  });

  // Initialize scheduler
  scheduler = new JobScheduler();
  scheduler.loadConfig();
  scheduler.startAll();

  logger.info("SQL Bridge App started");

  // IPC Handlers

  ipcMain.handle("get-jobs", () => {
    return scheduler.getJobs();
  });

  ipcMain.handle("add-job", (_event, job: Job) => {
    scheduler.addJob(job);
    return { success: true };
  });

  // Backwards-compatible handler: some renderers call 'create-job'
  ipcMain.handle("create-job", (_event, job: Job) => {
    try {
      scheduler.addJob(job);
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle(
    "update-job",
    (_event, jobId: string, updates: Partial<Job>) => {
      scheduler.updateJob(jobId, updates);
      return { success: true };
    }
  );

  ipcMain.handle("delete-job", (_event, jobId: string) => {
    scheduler.deleteJob(jobId);
    return { success: true };
  });

  ipcMain.handle("reschedule-jobs", () => {
    scheduler.rescheduleAllJobs();
    return { success: true };
  });

  ipcMain.handle("run-job", async (_event, jobId: string) => {
    try {
      await scheduler.runJobNow(jobId);
      return { success: true, message: "Job executed successfully" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("test-job", async (_event, jobId: string) => {
    try {
      const result = await scheduler.testJob(jobId);
      return result;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("get-logs", () => {
    return logger.getLogs(200);
  });

  ipcMain.handle("clear-logs", () => {
    logger.clearLogs();
    return { success: true };
  });

  // Connection Handlers
  ipcMain.handle("get-connections", () => {
    return scheduler.getConnections();
  });

  ipcMain.handle("add-connection", (_event, connection: any) => {
    logger.info("IPC add-connection called", undefined, {
      id: connection?.id,
      name: connection?.name,
      server: connection?.server,
      database: connection?.database,
    });
    scheduler.addConnection(connection);
    return { success: true };
  });

  ipcMain.handle(
    "update-connection",
    (_event, connectionId: string, updates: any) => {
      logger.info("IPC update-connection called", undefined, {
        connectionId,
        updates,
      });
      scheduler.updateConnection(connectionId, updates);
      return { success: true };
    }
  );

  ipcMain.handle("delete-connection", (_event, connectionId: string) => {
    try {
      scheduler.deleteConnection(connectionId);
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("duplicate-connection", (_event, connectionId: string) => {
    try {
      const duplicatedConnection = scheduler.duplicateConnection(connectionId);
      return { success: true, connection: duplicatedConnection };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("test-connection", async (_event, connectionId: string) => {
    try {
      const result = await scheduler.testConnection(connectionId);
      return result;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle(
    "bulk-test-connections",
    async (_event, connectionIds: string[]) => {
      try {
        // Use scheduler.bulkTestConnections - now truly parallel, completes in max timeout time
        const results = await scheduler.bulkTestConnections(connectionIds);
        return results;
      } catch (error: any) {
        return connectionIds.map((connectionId) => ({
          connectionId,
          success: false,
          message: error?.message || "Unknown error",
        }));
      }
    }
  );

  // Settings Handlers
  ipcMain.handle("get-settings", () => {
    return scheduler.getSettings();
  });

  ipcMain.handle("update-settings", (_event, settings: any) => {
    scheduler.updateSettings(settings);

    // Apply settings to ConnectionPoolManager
    if (settings.dbPoolMax || settings.defaultConnectionTimeout) {
      connectionPoolManager.updateConfig({
        poolMax: settings.dbPoolMax,
        connectionTimeout: settings.defaultConnectionTimeout * 1000, // convert to ms
      });
    }

    // Apply settings to JobQueue
    if (settings.jobQueueMaxConcurrent) {
      jobQueue.updateConfig({
        maxConcurrent: settings.jobQueueMaxConcurrent,
      });
    }

    // Update environment variables for runtime configuration
    if (settings.dbPoolMax)
      process.env.DB_POOL_MAX = String(settings.dbPoolMax);
    if (settings.maxConcurrentConnections)
      process.env.MAX_CONCURRENT_CONNECTIONS = String(
        settings.maxConcurrentConnections
      );
    if (settings.jobQueueMaxConcurrent)
      process.env.JOB_QUEUE_MAX_CONCURRENT = String(
        settings.jobQueueMaxConcurrent
      );

    logger.info(
      "Settings updated and applied to system components",
      undefined,
      settings
    );

    return { success: true };
  });

  // Financial Years Handlers
  ipcMain.handle("get-financial-years", () => {
    return scheduler.getFinancialYears();
  });

  ipcMain.handle("create-financial-year", (_event, year: string) => {
    try {
      const financialYear = scheduler.createFinancialYear(year);
      return { success: true, financialYear };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle(
    "update-financial-year",
    (_event, id: string, updates: any) => {
      try {
        scheduler.updateFinancialYear(id, updates);
        return { success: true };
      } catch (error: any) {
        return { success: false, message: error.message };
      }
    }
  );

  ipcMain.handle("delete-financial-year", (_event, id: string) => {
    try {
      scheduler.deleteFinancialYear(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  // Partners Handlers
  ipcMain.handle("get-partners", () => {
    return scheduler.getPartners();
  });

  ipcMain.handle("create-partner", (_event, name: string) => {
    try {
      const partner = scheduler.createPartner(name);
      return { success: true, partner };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("update-partner", (_event, id: string, updates: any) => {
    try {
      scheduler.updatePartner(id, updates);
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("delete-partner", (_event, id: string) => {
    try {
      scheduler.deletePartner(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  // Job Groups Handlers
  ipcMain.handle("get-job-groups", () => {
    return scheduler.getJobGroups();
  });

  ipcMain.handle("create-job-group", (_event, name: string) => {
    try {
      const jobGroup = scheduler.createJobGroup(name);
      return { success: true, jobGroup };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle(
    "update-job-group",
    (_event, oldName: string, newName: string) => {
      try {
        scheduler.updateJobGroup(oldName, newName);
        return { success: true };
      } catch (error: any) {
        return { success: false, message: error.message };
      }
    }
  );

  ipcMain.handle("delete-job-group", (_event, name: string) => {
    try {
      scheduler.deleteJobGroup(name);
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  // Monitoring and Metrics Handlers
  ipcMain.handle("get-pool-metrics", () => {
    try {
      return connectionPoolManager.getMetrics();
    } catch (error: any) {
      logger.error("Failed to get pool metrics", undefined, error);
      return { error: error.message };
    }
  });

  ipcMain.handle("get-pool-info", () => {
    try {
      return connectionPoolManager.getPoolInfo();
    } catch (error: any) {
      logger.error("Failed to get pool info", undefined, error);
      return { error: error.message };
    }
  });

  ipcMain.handle("get-queue-metrics", () => {
    try {
      return jobQueue.getMetrics();
    } catch (error: any) {
      logger.error("Failed to get queue metrics", undefined, error);
      return { error: error.message };
    }
  });

  ipcMain.handle("get-running-jobs", () => {
    try {
      return jobQueue.getRunningJobs();
    } catch (error: any) {
      logger.error("Failed to get running jobs", undefined, error);
      return { error: error.message };
    }
  });

  ipcMain.handle("get-pending-jobs", () => {
    try {
      return jobQueue.getPendingJobs();
    } catch (error: any) {
      logger.error("Failed to get pending jobs", undefined, error);
      return { error: error.message };
    }
  });

  ipcMain.handle("get-job-progress", (_event, jobId: string) => {
    try {
      return progressStream.getJobProgress(jobId);
    } catch (error: any) {
      logger.error("Failed to get job progress", undefined, error);
      return { error: error.message };
    }
  });

  ipcMain.handle("get-all-progress", () => {
    try {
      return progressStream.getAllProgress();
    } catch (error: any) {
      logger.error("Failed to get all progress", undefined, error);
      return { error: error.message };
    }
  });

  // Window Control Handlers
  ipcMain.handle("minimize-window", () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle("maximize-window", () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle("show-save-dialog", async (_event, options: any) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow!, options);
      return result;
    } catch (error: any) {
      console.error("Save dialog error:", error);
      return { canceled: true, error: error.message };
    }
  });

  // Job History Handlers
  ipcMain.handle("get-job-history", () => {
    try {
      return jobHistory;
    } catch (error: any) {
      logger.error("Failed to get job history", undefined, error);
      return [];
    }
  });

  ipcMain.handle(
    "run-job-connections",
    async (_event, jobId: string, connectionIds: string[]) => {
      try {
        await scheduler.runJobForConnections(jobId, connectionIds);
        return { success: true };
      } catch (error: any) {
        logger.error("Failed to run job for connections", jobId, error);
        return { success: false, message: error.message };
      }
    }
  );

  ipcMain.handle("delete-job-history", (_event, ids: string[]) => {
    try {
      jobHistory = jobHistory.filter((h) => !ids.includes(h.id));
      saveJobHistory();
      return { success: true };
    } catch (error: any) {
      logger.error("Failed to delete job history", undefined, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("clear-job-history", () => {
    try {
      jobHistory = [];
      saveJobHistory();
      return { success: true };
    } catch (error: any) {
      logger.error("Failed to clear job history", undefined, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("open-file-location", async (_event, filePath: string) => {
    try {
      // Show the file in its containing folder
      await shell.showItemInFolder(filePath);
      return { success: true };
    } catch (error: any) {
      console.error("Error opening file location:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("close-window", () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

  // Now that handlers are registered, create the windows (prevents renderer calling IPC before handlers exist)
  createSplash();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplash();
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (scheduler) {
      scheduler.stopAll();
    }
    app.quit();
  }
});

app.on("before-quit", () => {
  if (scheduler) {
    scheduler.stopAll();
  }
});
