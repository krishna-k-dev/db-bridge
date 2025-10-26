import { EventEmitter } from "events";
import { logger } from "./logger";

export interface QueuedJob {
  id: string;
  jobId: string;
  priority: number; // Lower number = higher priority
  retryCount: number;
  maxRetries: number;
  execute: () => Promise<any>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: Error;
}

export interface QueueMetrics {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  avgProcessingTime: number;
}

export class JobQueue extends EventEmitter {
  private static instance: JobQueue;
  private queue: QueuedJob[] = [];
  private running = new Map<string, QueuedJob>();
  private maxConcurrent: number;
  private retryDelayMs: number;
  private backoffMultiplier: number;
  private isProcessing = false;
  private metrics = {
    completed: 0,
    failed: 0,
    totalProcessingTime: 0,
  };

  private constructor() {
    super();
    this.maxConcurrent = Number(process.env.JOB_QUEUE_MAX_CONCURRENT || 10);
    this.retryDelayMs = Number(process.env.JOB_QUEUE_RETRY_DELAY_MS || 5000);
    this.backoffMultiplier = Number(
      process.env.JOB_QUEUE_BACKOFF_MULTIPLIER || 2
    );

    logger.info("JobQueue initialized", undefined, {
      maxConcurrent: this.maxConcurrent,
      retryDelayMs: this.retryDelayMs,
      backoffMultiplier: this.backoffMultiplier,
    });
  }

  static getInstance(): JobQueue {
    if (!JobQueue.instance) {
      JobQueue.instance = new JobQueue();
    }
    return JobQueue.instance;
  }

  /**
   * Update configuration dynamically (from settings page)
   */
  updateConfig(config: {
    maxConcurrent?: number;
    retryDelayMs?: number;
    backoffMultiplier?: number;
  }): void {
    if (config.maxConcurrent !== undefined)
      this.maxConcurrent = config.maxConcurrent;
    if (config.retryDelayMs !== undefined)
      this.retryDelayMs = config.retryDelayMs;
    if (config.backoffMultiplier !== undefined)
      this.backoffMultiplier = config.backoffMultiplier;

    logger.info("JobQueue config updated", undefined, config);

    // Resume processing if we increased concurrency
    if (!this.isProcessing && this.queue.length > 0) {
      this.processQueue();
    }
  }

  /**
   * Add a job to the queue
   */
  async enqueue(
    jobId: string,
    execute: () => Promise<any>,
    options?: {
      priority?: number;
      maxRetries?: number;
    }
  ): Promise<string> {
    const queuedJob: QueuedJob = {
      id: `${jobId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      jobId,
      priority: options?.priority || 10,
      retryCount: 0,
      maxRetries: options?.maxRetries || 3,
      execute,
      createdAt: new Date(),
    };

    this.queue.push(queuedJob);

    // Sort by priority (lower number = higher priority)
    this.queue.sort((a, b) => a.priority - b.priority);

    logger.info("Job enqueued", undefined, {
      queuedJobId: queuedJob.id,
      jobId,
      priority: queuedJob.priority,
      queueLength: this.queue.length,
    });

    this.emit("job:enqueued", {
      queuedJobId: queuedJob.id,
      jobId,
      queueLength: this.queue.length,
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    return queuedJob.id;
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 || this.running.size > 0) {
      // Start new jobs up to maxConcurrent
      while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
        const job = this.queue.shift();
        if (!job) break;

        this.runJob(job);
      }

      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.isProcessing = false;
    logger.info("JobQueue processing completed");
  }

  /**
   * Run a single job
   */
  private async runJob(job: QueuedJob): Promise<void> {
    this.running.set(job.id, job);
    job.startedAt = new Date();

    logger.info("Job started", undefined, {
      queuedJobId: job.id,
      jobId: job.jobId,
      retryCount: job.retryCount,
      runningCount: this.running.size,
    });

    this.emit("job:started", {
      queuedJobId: job.id,
      jobId: job.jobId,
      retryCount: job.retryCount,
    });

    try {
      const result = await job.execute();
      job.completedAt = new Date();

      const processingTime =
        job.completedAt.getTime() - job.startedAt.getTime();
      this.metrics.completed++;
      this.metrics.totalProcessingTime += processingTime;

      logger.info("Job completed", undefined, {
        queuedJobId: job.id,
        jobId: job.jobId,
        processingTime,
      });

      this.emit("job:completed", {
        queuedJobId: job.id,
        jobId: job.jobId,
        result,
        processingTime,
      });

      this.running.delete(job.id);
    } catch (error) {
      job.error = error as Error;

      logger.error("Job failed", undefined, {
        queuedJobId: job.id,
        jobId: job.jobId,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        error: error instanceof Error ? error.message : String(error),
      });

      this.emit("job:failed", {
        queuedJobId: job.id,
        jobId: job.jobId,
        error,
        retryCount: job.retryCount,
      });

      // Retry logic with exponential backoff
      if (job.retryCount < job.maxRetries) {
        job.retryCount++;
        const retryDelay =
          this.retryDelayMs *
          Math.pow(this.backoffMultiplier, job.retryCount - 1);

        logger.info("Job will be retried", undefined, {
          queuedJobId: job.id,
          jobId: job.jobId,
          retryCount: job.retryCount,
          retryDelay,
        });

        this.running.delete(job.id);

        // Re-enqueue after delay
        setTimeout(() => {
          this.queue.unshift(job); // Add to front with higher priority
          if (!this.isProcessing) {
            this.processQueue();
          }
        }, retryDelay);
      } else {
        // Max retries exceeded
        this.metrics.failed++;
        job.completedAt = new Date();

        logger.error("Job failed permanently", undefined, {
          queuedJobId: job.id,
          jobId: job.jobId,
          retryCount: job.retryCount,
        });

        this.emit("job:failed:permanent", {
          queuedJobId: job.id,
          jobId: job.jobId,
          error,
        });

        this.running.delete(job.id);
      }
    }
  }

  /**
   * Get queue metrics
   */
  getMetrics(): QueueMetrics {
    const avgProcessingTime =
      this.metrics.completed > 0
        ? this.metrics.totalProcessingTime / this.metrics.completed
        : 0;

    return {
      pending: this.queue.length,
      running: this.running.size,
      completed: this.metrics.completed,
      failed: this.metrics.failed,
      totalProcessed: this.metrics.completed + this.metrics.failed,
      avgProcessingTime,
    };
  }

  /**
   * Get currently running jobs
   */
  getRunningJobs(): Array<{
    queuedJobId: string;
    jobId: string;
    startedAt: Date;
    retryCount: number;
  }> {
    return Array.from(this.running.values()).map((job) => ({
      queuedJobId: job.id,
      jobId: job.jobId,
      startedAt: job.startedAt!,
      retryCount: job.retryCount,
    }));
  }

  /**
   * Get pending jobs
   */
  getPendingJobs(): Array<{
    queuedJobId: string;
    jobId: string;
    priority: number;
    createdAt: Date;
  }> {
    return this.queue.map((job) => ({
      queuedJobId: job.id,
      jobId: job.jobId,
      priority: job.priority,
      createdAt: job.createdAt,
    }));
  }

  /**
   * Clear all pending jobs
   */
  clearPending(): void {
    const count = this.queue.length;
    this.queue = [];
    logger.info("Cleared pending jobs", undefined, { count });
    this.emit("queue:cleared", { count });
  }

  /**
   * Graceful shutdown - wait for running jobs to complete
   */
  async shutdown(timeoutMs: number = 30000): Promise<void> {
    logger.info("JobQueue shutting down gracefully", undefined, {
      pending: this.queue.length,
      running: this.running.size,
      timeoutMs,
    });

    // Clear pending queue
    this.clearPending();

    // Wait for running jobs to complete
    const start = Date.now();
    while (this.running.size > 0 && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.running.size > 0) {
      logger.warn(
        "JobQueue shutdown timeout - some jobs still running",
        undefined,
        {
          runningCount: this.running.size,
        }
      );
    } else {
      logger.info("JobQueue shut down successfully");
    }
  }
}
