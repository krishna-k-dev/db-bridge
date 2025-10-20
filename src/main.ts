import { app, BrowserWindow, ipcMain } from "electron";
import * as remoteMain from "@electron/remote/main";
import * as path from "path";
import { JobScheduler } from "./core/scheduler";
import { logger } from "./core/logger";
import { Job } from "./types";

let mainWindow: BrowserWindow | null = null;
let scheduler: JobScheduler;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Remove menu bar
    backgroundColor: "#6366f1", // Logo color (indigo)
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Enable remote for this window
  remoteMain.enable(mainWindow.webContents);

  mainWindow.loadFile(path.join(__dirname, "../src/renderer/index.html"));

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

  // Initialize scheduler
  scheduler = new JobScheduler();
  scheduler.loadConfig();
  scheduler.startAll();

  logger.info("SQL Bridge App started");

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    scheduler.stopAll();
    app.quit();
  }
});

app.on("before-quit", () => {
  scheduler.stopAll();
});

// IPC Handlers

ipcMain.handle("get-jobs", () => {
  return scheduler.getJobs();
});

ipcMain.handle("add-job", (_event, job: Job) => {
  scheduler.addJob(job);
  return { success: true };
});

ipcMain.handle("update-job", (_event, jobId: string, updates: Partial<Job>) => {
  scheduler.updateJob(jobId, updates);
  return { success: true };
});

ipcMain.handle("delete-job", (_event, jobId: string) => {
  scheduler.deleteJob(jobId);
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
  scheduler.addConnection(connection);
  return { success: true };
});

ipcMain.handle(
  "update-connection",
  (_event, connectionId: string, updates: any) => {
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

ipcMain.handle("test-connection", async (_event, connectionId: string) => {
  try {
    const result = await scheduler.testConnection(connectionId);
    return result;
  } catch (error: any) {
    return { success: false, message: error.message };
  }
});

// Settings Handlers
ipcMain.handle("get-settings", () => {
  return scheduler.getSettings();
});

ipcMain.handle("update-settings", (_event, settings: any) => {
  scheduler.updateSettings(settings);
  return { success: true };
});
