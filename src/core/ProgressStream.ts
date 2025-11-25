import { EventEmitter } from "events";
import { logger } from "./logger";

export interface ProgressEvent {
  jobId: string;
  type:
    | "job:started"
    | "job:progress"
    | "job:connection:started"
    | "job:connection:progress"
    | "job:connection:completed"
    | "job:connection:failed"
    | "job:completed"
    | "job:failed"
    | "job:cancelled";
  timestamp: Date;
  data: any;
}

export interface JobProgress {
  jobId: string;
  jobName?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt?: Date;
  completedAt?: Date;
  totalConnections: number;
  completedConnections: number;
  failedConnections: number;
  currentStep?: string;
  percentage: number;
  errors?: string[];
  connectionProgress?: Map<string, ConnectionProgress>;
  cancelRequested?: boolean; // Flag to indicate cancellation requested
}

export interface ConnectionProgress {
  connectionId: string;
  connectionName: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  currentStep?: string;
  rowsProcessed?: number;
  totalRows?: number;
  percentage: number;
  error?: string;
}

export class ProgressStream extends EventEmitter {
  private static instance: ProgressStream;
  private jobProgressMap = new Map<string, JobProgress>();
  private mainWindow: any = null;

  private constructor() {
    super();
    this.setMaxListeners(100); // Support many listeners
  }

  static getInstance(): ProgressStream {
    if (!ProgressStream.instance) {
      ProgressStream.instance = new ProgressStream();
    }
    return ProgressStream.instance;
  }

  /**
   * Set main window for IPC forwarding
   */
  setMainWindow(window: any): void {
    this.mainWindow = window;
    logger.info("ProgressStream: main window registered");
  }

  /**
   * Emit progress event and forward to renderer
   */
  private emitProgress(event: ProgressEvent): void {
    this.emit("progress", event);

    // Forward to renderer via IPC
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("job:progress", event);
    }
  }

  /**
   * Start tracking a job
   */
  startJob(jobId: string, jobName: string, totalConnections: number): void {
    const progress: JobProgress = {
      jobId,
      jobName,
      status: "running",
      startedAt: new Date(),
      totalConnections,
      completedConnections: 0,
      failedConnections: 0,
      percentage: 0,
      connectionProgress: new Map(),
    };

    this.jobProgressMap.set(jobId, progress);

    this.emitProgress({
      jobId,
      type: "job:started",
      timestamp: new Date(),
      data: {
        jobName,
        totalConnections,
      },
    });
  }

  /**
   * Update job step
   */
  updateJobStep(jobId: string, step: string): void {
    const progress = this.jobProgressMap.get(jobId);
    if (!progress) return;

    progress.currentStep = step;

    this.emitProgress({
      jobId,
      type: "job:progress",
      timestamp: new Date(),
      data: {
        step,
        percentage: progress.percentage,
      },
    });
  }

  /**
   * Start tracking a connection within a job
   */
  startConnection(
    jobId: string,
    connectionId: string,
    connectionName: string
  ): void {
    const progress = this.jobProgressMap.get(jobId);
    if (!progress) return;

    const connProgress: ConnectionProgress = {
      connectionId,
      connectionName,
      status: "running",
      startedAt: new Date(),
      percentage: 0,
    };

    progress.connectionProgress!.set(connectionId, connProgress);

    this.emitProgress({
      jobId,
      type: "job:connection:started",
      timestamp: new Date(),
      data: {
        connectionId,
        connectionName,
      },
    });
  }

  /**
   * Update connection progress
   */
  updateConnectionProgress(
    jobId: string,
    connectionId: string,
    data: {
      step?: string;
      rowsProcessed?: number;
      totalRows?: number;
    }
  ): void {
    const progress = this.jobProgressMap.get(jobId);
    if (!progress) return;

    const connProgress = progress.connectionProgress!.get(connectionId);
    if (!connProgress) return;

    if (data.step) connProgress.currentStep = data.step;
    if (data.rowsProcessed !== undefined)
      connProgress.rowsProcessed = data.rowsProcessed;
    if (data.totalRows !== undefined) connProgress.totalRows = data.totalRows;

    // Calculate connection percentage
    if (connProgress.totalRows && connProgress.totalRows > 0) {
      connProgress.percentage = Math.round(
        ((connProgress.rowsProcessed || 0) / connProgress.totalRows) * 100
      );
    }

    // Update overall job percentage
    this.updateJobPercentage(jobId);

    this.emitProgress({
      jobId,
      type: "job:connection:progress",
      timestamp: new Date(),
      data: {
        connectionId,
        ...data,
        percentage: connProgress.percentage,
      },
    });
  }

  /**
   * Mark connection as completed
   */
  completeConnection(
    jobId: string,
    connectionId: string,
    rowsProcessed?: number
  ): void {
    const progress = this.jobProgressMap.get(jobId);
    if (!progress) return;

    const connProgress = progress.connectionProgress!.get(connectionId);
    if (!connProgress) return;

    connProgress.status = "completed";
    connProgress.completedAt = new Date();
    connProgress.percentage = 100;
    if (rowsProcessed !== undefined) connProgress.rowsProcessed = rowsProcessed;

    progress.completedConnections++;
    this.updateJobPercentage(jobId);

    this.emitProgress({
      jobId,
      type: "job:connection:completed",
      timestamp: new Date(),
      data: {
        connectionId,
        rowsProcessed,
        duration:
          connProgress.completedAt.getTime() -
          (connProgress.startedAt?.getTime() || 0),
      },
    });
  }

  /**
   * Mark connection as failed
   */
  failConnection(jobId: string, connectionId: string, error: string): void {
    const progress = this.jobProgressMap.get(jobId);
    if (!progress) return;

    const connProgress = progress.connectionProgress!.get(connectionId);
    if (!connProgress) return;

    connProgress.status = "failed";
    connProgress.completedAt = new Date();
    connProgress.error = error;

    progress.failedConnections++;
    if (!progress.errors) progress.errors = [];
    progress.errors.push(`${connProgress.connectionName}: ${error}`);

    this.updateJobPercentage(jobId);

    this.emitProgress({
      jobId,
      type: "job:connection:failed",
      timestamp: new Date(),
      data: {
        connectionId,
        error,
      },
    });
  }

  /**
   * Update overall job percentage based on connections
   */
  private updateJobPercentage(jobId: string): void {
    const progress = this.jobProgressMap.get(jobId);
    if (!progress) return;

    const total = progress.totalConnections;
    const completed =
      progress.completedConnections + progress.failedConnections;

    progress.percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  }

  /**
   * Mark job as completed
   */
  completeJob(jobId: string, result?: any): void {
    const progress = this.jobProgressMap.get(jobId);
    if (!progress) return;

    progress.status = "completed";
    progress.completedAt = new Date();
    progress.percentage = 100;

    const eventData = {
      result,
      completedConnections: progress.completedConnections,
      failedConnections: progress.failedConnections,
      duration:
        progress.completedAt.getTime() - (progress.startedAt?.getTime() || 0),
    };

    this.emitProgress({
      jobId,
      type: "job:completed",
      timestamp: new Date(),
      data: eventData,
    });

    // Emit for history tracking
    this.emit("job:finished", {
      jobId,
      status: "completed",
      progress,
      result,
      duration: eventData.duration,
    });

    // Clean up after 5 minutes
    setTimeout(() => {
      this.jobProgressMap.delete(jobId);
    }, 300000);
  }

  /**
   * Mark job as failed
   */
  failJob(jobId: string, error: string): void {
    const progress = this.jobProgressMap.get(jobId);
    if (!progress) return;

    progress.status = "failed";
    progress.completedAt = new Date();
    if (!progress.errors) progress.errors = [];
    progress.errors.push(error);

    const duration =
      progress.completedAt.getTime() - (progress.startedAt?.getTime() || 0);

    this.emitProgress({
      jobId,
      type: "job:failed",
      timestamp: new Date(),
      data: {
        error,
        completedConnections: progress.completedConnections,
        failedConnections: progress.failedConnections,
      },
    });

    // Emit for history tracking
    this.emit("job:finished", {
      jobId,
      status: "failed",
      progress,
      error,
      duration,
    });

    // Clean up after 5 minutes
    setTimeout(() => {
      this.jobProgressMap.delete(jobId);
    }, 300000);
  }

  /**
   * Get progress for a specific job
   */
  getJobProgress(jobId: string): JobProgress | undefined {
    return this.jobProgressMap.get(jobId);
  }

  /**
   * Get all active job progress
   */
  getAllProgress(): JobProgress[] {
    return Array.from(this.jobProgressMap.values());
  }

  /**
   * Clear completed/failed jobs from memory
   */
  clearCompleted(): void {
    for (const [jobId, progress] of this.jobProgressMap.entries()) {
      if (progress.status === "completed" || progress.status === "failed") {
        this.jobProgressMap.delete(jobId);
      }
    }
  }

  /**
   * Request cancellation of a running job
   */
  cancelJob(jobId: string): boolean {
    const progress = this.jobProgressMap.get(jobId);
    if (!progress) {
      logger.warn(`Cannot cancel job ${jobId}: not found in progress map`);
      return false;
    }

    if (progress.status !== "running") {
      logger.warn(
        `Cannot cancel job ${jobId}: status is ${progress.status}, not running`
      );
      return false;
    }

    progress.cancelRequested = true;
    logger.info(`✋ Cancellation requested for job: ${jobId} (${progress.jobName})`);

    this.emitProgress({
      jobId,
      type: "job:progress",
      timestamp: new Date(),
      data: {
        message: "Cancellation requested",
        cancelRequested: true,
      },
    });

    return true;
  }

  /**
   * Check if cancellation has been requested for a job
   */
  isCancellationRequested(jobId: string): boolean {
    const progress = this.jobProgressMap.get(jobId);
    const requested = progress?.cancelRequested === true;
    
    if (requested) {
      logger.info(`🛑 Cancellation check: Job ${jobId} has cancel flag = true`);
    }
    
    return requested;
  }

  /**
   * Mark job as cancelled
   */
  cancelJobComplete(jobId: string): void {
    const progress = this.jobProgressMap.get(jobId);
    if (!progress) return;

    progress.status = "cancelled";
    progress.completedAt = new Date();
    progress.cancelRequested = false; // Clear the flag

    const duration =
      progress.completedAt.getTime() - (progress.startedAt?.getTime() || 0);

    logger.info(
      `❌ Job ${jobId} (${progress.jobName}) cancelled successfully after ${(duration / 1000).toFixed(1)}s`
    );

    // Send proper cancelled event (not failed)
    this.emitProgress({
      jobId,
      type: "job:cancelled",
      timestamp: new Date(),
      data: {
        message: "Job cancelled by user",
        completedConnections: progress.completedConnections,
        failedConnections: progress.failedConnections,
        duration,
      },
    });

    // Emit for history tracking
    this.emit("job:finished", {
      jobId,
      status: "cancelled",
      progress,
      error: "Job cancelled by user",
      duration,
    });

    // Clean up after 5 minutes
    setTimeout(() => {
      this.jobProgressMap.delete(jobId);
    }, 300000);
  }
}

