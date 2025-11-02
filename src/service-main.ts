// Background Service Entry Point
// This runs WITHOUT UI - pure backend service
import { app } from "electron";
import * as path from "path";
import { JobScheduler } from "./core/scheduler";
import { logger } from "./core/logger";

// Disable GPU for background service (no UI needed)
app.disableHardwareAcceleration();

// Prevent app from quitting when all windows are closed
app.on("window-all-closed", () => {
  // Don't quit - keep running in background
  logger.info("Windows closed - continuing to run in background");
});

async function startBackgroundService() {
  try {
    logger.info("=".repeat(60));
    logger.info("SQL BRIDGE BACKGROUND SERVICE STARTING");
    logger.info("=".repeat(60));
    logger.info(`Environment: ${process.env.NODE_ENV || "production"}`);
    logger.info(`Working Directory: ${process.cwd()}`);
    logger.info(`Node Version: ${process.version}`);
    logger.info("=".repeat(60));

    // Initialize scheduler
    const configPath = path.join(
      app.getPath("userData"),
      "config",
      "config.json"
    );
    const scheduler = new JobScheduler(configPath);

    logger.info("Loading configuration...");
    scheduler.loadConfig();

    logger.info("Starting all scheduled jobs...");
    scheduler.startAll();

    // Start connection test scheduler
    logger.info("Starting connection test scheduler...");
    scheduler.startConnectionTestScheduler();

    logger.info("=".repeat(60));
    logger.info("✅ SQL BRIDGE SERVICE STARTED SUCCESSFULLY");
    logger.info("=".repeat(60));
    logger.info("Service is now running in background...");
    logger.info("Jobs will execute according to their schedules");
    logger.info("Service will continue running even if UI is closed");
    logger.info("=".repeat(60));
  } catch (error: any) {
    logger.error("Failed to start background service", undefined, error);
    console.error("❌ SERVICE STARTUP FAILED:", error);
    // Don't exit - retry or wait for manual intervention
  }
}

// Wait for Electron to be ready
app.whenReady().then(() => {
  startBackgroundService();
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception in background service", undefined, error);
  console.error("❌ UNCAUGHT EXCEPTION:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error(
    "Unhandled rejection in background service",
    undefined,
    reason as Error
  );
  console.error("❌ UNHANDLED REJECTION:", reason);
});

// Log when service is terminating
app.on("will-quit", () => {
  logger.info("Service is shutting down...");
  console.log("🛑 SQL Bridge Service shutting down...");
});

export {};
