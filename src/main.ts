import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as remoteMain from "@electron/remote/main";
import * as path from "path";
import { JobScheduler } from "./core/scheduler";
import { logger } from "./core/logger";
import { Job } from "./types";

let mainWindow: BrowserWindow | null = null;
let splash: BrowserWindow | null = null;
let scheduler: JobScheduler;

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

  // Now that handlers are registered, create the windows (prevents renderer calling IPC before handlers exist)
  createSplash();
  createWindow();

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
