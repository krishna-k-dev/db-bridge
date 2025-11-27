import { EventEmitter } from "events";
import { logger } from "./logger";
import * as fs from "fs";
import * as path from "path";

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

// Checkpoint interface for resuming jobs
export interface JobCheckpoint {
  jobId: string;
  jobName: string;
  startedAt: Date;
  completedConnectionIds: string[]; // IDs of successfully completed connections
  failedConnectionIds: string[]; // IDs of failed connections
  totalConnections: number;
  lastUpdated: Date;
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
  checkpoint?: JobCheckpoint; // Checkpoint data for resume
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
  private checkpointDir: string;

  private constructor() {
    super();
    this.setMaxListeners(100); // Support many listeners
    
    // Setup checkpoint directory
    this.checkpointDir = path.join(process.cwd(), "logs", "checkpoints");
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  static getInstance(): ProgressStream {
    if (!ProgressStream.instance) {
      ProgressStream.instance = new ProgressStream();
    }
    return ProgressStream.instance;
  }

  /**
   * Get checkpoint file path for a job
   */
  private getCheckpointPath(jobId: string): string {
    return path.join(this.checkpointDir, `${jobId}.json`);
  }

  /**
   * Save checkpoint to disk
   */
  saveCheckpoint(jobId: string): void {
    try {
      const progress = this.jobProgressMap.get(jobId);
      if (!progress || !progress.checkpoint) return;

      const checkpointPath = this.getCheckpointPath(jobId);
      fs.writeFileSync(
        checkpointPath,
        JSON.stringify(progress.checkpoint, null, 2),
        "utf8"
      );
      
      logger.info(`💾 Checkpoint saved: ${progress.checkpoint.completedConnectionIds.length}/${progress.checkpoint.totalConnections} connections completed`, jobId);
    } catch (error: any) {
      logger.error(`Failed to save checkpoint: ${error.message}`, jobId, error);
    }
  }

  /**
   * Load checkpoint from disk
   */
  loadCheckpoint(jobId: string): JobCheckpoint | null {
    try {
      const checkpointPath = this.getCheckpointPath(jobId);
      
      if (!fs.existsSync(checkpointPath)) {
        return null;
      }

      const data = fs.readFileSync(checkpointPath, "utf8");
      const checkpoint = JSON.parse(data) as JobCheckpoint;
      
      // Convert date strings back to Date objects
      checkpoint.startedAt = new Date(checkpoint.startedAt);
      checkpoint.lastUpdated = new Date(checkpoint.lastUpdated);
      
      logger.info(`📂 Checkpoint loaded: ${checkpoint.completedConnectionIds.length}/${checkpoint.totalConnections} connections already completed`, jobId);
      return checkpoint;
    } catch (error: any) {
      logger.error(`Failed to load checkpoint: ${error.message}`, jobId, error);
      return null;
    }
  }

  /**
   * Delete checkpoint file
   */
  deleteCheckpoint(jobId: string): void {
    try {
      const checkpointPath = this.getCheckpointPath(jobId);
      if (fs.existsSync(checkpointPath)) {
        fs.unlinkSync(checkpointPath);
        logger.info(`🗑️ Checkpoint deleted`, jobId);
      }
    } catch (error: any) {
      logger.error(`Failed to delete checkpoint: ${error.message}`, jobId, error);
    }
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
   * Start tracking a job (with optional checkpoint for resume)
   */
  startJob(jobId: string, jobName: string, totalConnections: number, resumeFromCheckpoint?: boolean): void {
    let checkpoint: JobCheckpoint | null = null;
    
    // Try to load existing checkpoint if resuming
    if (resumeFromCheckpoint) {
      checkpoint = this.loadCheckpoint(jobId);
    }
    
    const progress: JobProgress = {
      jobId,
      jobName,
      status: "running",
      startedAt: checkpoint?.startedAt || new Date(),
      totalConnections,
      completedConnections: checkpoint?.completedConnectionIds.length || 0,
      failedConnections: checkpoint?.failedConnectionIds.length || 0,
      percentage: 0,
      connectionProgress: new Map(),
      checkpoint: checkpoint || {
        jobId,
        jobName,
        startedAt: new Date(),
        completedConnectionIds: [],
        failedConnectionIds: [],
        totalConnections,
        lastUpdated: new Date(),
      },
    };

    this.jobProgressMap.set(jobId, progress);

    if (checkpoint) {
      logger.info(`▶️ Resuming job from checkpoint: ${checkpoint.completedConnectionIds.length} connections already completed`, jobId);
    }

    this.emitProgress({
      jobId,
      type: "job:started",
      timestamp: new Date(),
      data: {
        jobName,
        totalConnections,
        resumed: !!checkpoint,
        alreadyCompleted: checkpoint?.completedConnectionIds.length || 0,
      },
    });
  }

  /**
   * Update job's current step
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
   * Get job progress (useful for checking checkpoint state)
   */
  getJobProgress(jobId: string): JobProgress | undefined {
    return this.jobProgressMap.get(jobId);
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
    
    // Update checkpoint
    if (progress.checkpoint) {
      if (!progress.checkpoint.completedConnectionIds.includes(connectionId)) {
        progress.checkpoint.completedConnectionIds.push(connectionId);
        progress.checkpoint.lastUpdated = new Date();
        this.saveCheckpoint(jobId);
      }
    }
    
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
    
    // Update checkpoint
    if (progress.checkpoint) {
      if (!progress.checkpoint.failedConnectionIds.includes(connectionId)) {
        progress.checkpoint.failedConnectionIds.push(connectionId);
        progress.checkpoint.lastUpdated = new Date();
        this.saveCheckpoint(jobId);
      }
    }
    
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

    // Delete checkpoint file when job completes successfully
    this.deleteCheckpoint(jobId);

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

