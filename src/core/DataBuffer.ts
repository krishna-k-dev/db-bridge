import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";
import { Job, JobMeta, SQLConnection } from "../types";
import { getAdapter } from "../adapters";
import { shouldTrigger } from "./trigger";

interface BufferedData {
  connection: SQLConnection;
  data: any[];
  meta: JobMeta;
}

interface DestinationBuffer {
  destinationType: string;
  destination: any;
  buffer: BufferedData[];
  lastFlushTime: number;
}

/**
 * Hybrid Batching Data Buffer
 *
 * Buffers data from multiple connections and sends in batches:
 * - Every 5 seconds (time-based)
 * - When buffer reaches 100 rows (size-based)
 * - On manual flush (e.g., job completion)
 *
 * Features:
 * - Prevents API rate limit issues
 * - Optimizes network calls
 * - Crash recovery via file backup
 */
export class DataBuffer {
  private static instance: DataBuffer;
  private buffers: Map<string, DestinationBuffer> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;
  // Increase flush interval to reduce API call frequency and give Google Sheets time to settle
  private readonly FLUSH_INTERVAL_MS = 10000; // 10 seconds
  // Increase threshold to allow up to ~150 rows before forcing a flush
  private readonly BATCH_SIZE_THRESHOLD = 150; // rows
  private readonly BACKUP_DIR = path.join(
    process.cwd(),
    "logs",
    "buffer-backup"
  );
  private jobId: string = "";

  private constructor() {
    this.ensureBackupDir();
  }

  public static getInstance(): DataBuffer {
    if (!DataBuffer.instance) {
      DataBuffer.instance = new DataBuffer();
    }
    return DataBuffer.instance;
  }

  /**
   * Ensure backup directory exists
   */
  private ensureBackupDir(): void {
    if (!fs.existsSync(this.BACKUP_DIR)) {
      fs.mkdirSync(this.BACKUP_DIR, { recursive: true });
    }
  }

  /**
   * Start buffering for a job - initializes auto-flush timer
   */
  public startBuffering(jobId: string, job: Job): void {
    this.jobId = jobId;

    // Clear any existing buffers for this job
    this.buffers.clear();

    // Initialize buffers for streaming destinations
    const streamingDestinationTypes = [
      "google_sheets",
      "webhook",
      "custom_api",
    ];

    for (const destination of job.destinations) {
      if (streamingDestinationTypes.includes(destination.type)) {
        const key = this.getBufferKey(jobId, destination.type);
        this.buffers.set(key, {
          destinationType: destination.type,
          destination: destination,
          buffer: [],
          lastFlushTime: Date.now(),
        });
      }
    }

    // Start auto-flush timer (every 5 seconds)
    this.startAutoFlush();

    logger.info(
      `📦 Buffer initialized for ${this.buffers.size} streaming destination(s)`,
      jobId
    );
  }

  /**
   * Add data to buffer from a connection
   */
  public async addToBuffer(
    jobId: string,
    job: Job,
    connection: SQLConnection,
    data: any[]
  ): Promise<void> {
    if (data.length === 0) return;

    // Check trigger condition
    if (!shouldTrigger(job, data)) {
      logger.info(
        `Trigger condition not met for ${connection.name}, skipping buffer`,
        jobId
      );
      return;
    }

    const meta: JobMeta = {
      jobId: job.id,
      jobName: job.name,
      runTime: job.lastRun,
      rowCount: data.length,
      connectionId: connection.id,
      connectionName: connection.database || connection.name,
      financialYear: connection.financialYear || "",
      group: connection.group || "self",
      partner: connection.group === "partner" ? connection.partner || "" : "",
    } as any;

    const streamingDestinationTypes = [
      "google_sheets",
      "webhook",
      "custom_api",
    ];

    for (const destination of job.destinations) {
      if (!streamingDestinationTypes.includes(destination.type)) continue;

      const key = this.getBufferKey(jobId, destination.type);
      const destBuffer = this.buffers.get(key);

      if (!destBuffer) continue;

      // Add to buffer
      destBuffer.buffer.push({ connection, data, meta });

      const totalRows = destBuffer.buffer.reduce(
        (sum, item) => sum + item.data.length,
        0
      );

      logger.info(
        `📦 Buffered ${data.length} rows from ${connection.name} to ${destination.type} (Total: ${totalRows} rows from ${destBuffer.buffer.length} connection(s))`,
        jobId
      );

      // SIZE-BASED FLUSH: If buffer exceeds threshold, flush immediately
      if (totalRows >= this.BATCH_SIZE_THRESHOLD) {
        logger.info(
          `🚀 Buffer threshold reached (${totalRows} >= ${this.BATCH_SIZE_THRESHOLD}), flushing ${destination.type}...`,
          jobId
        );
        await this.flushBuffer(key, jobId);
      }

      // Backup buffer to file for crash recovery
      await this.backupBuffer(key, destBuffer);
    }
  }

  /**
   * Start auto-flush timer (every 5 seconds)
   */
  private startAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    this.flushInterval = setInterval(async () => {
      await this.flushAllBuffers();
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Flush all buffers (time-based or manual)
   */
  private async flushAllBuffers(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [key] of this.buffers) {
      promises.push(this.flushBuffer(key, this.jobId));
    }

    await Promise.all(promises);
  }

  /**
   * Flush a specific buffer to its destination
   */
  private async flushBuffer(bufferKey: string, jobId: string): Promise<void> {
    const destBuffer = this.buffers.get(bufferKey);

    if (!destBuffer || destBuffer.buffer.length === 0) {
      return; // Nothing to flush
    }

    const { destinationType, destination, buffer } = destBuffer;
    const totalRows = buffer.reduce((sum, item) => sum + item.data.length, 0);

    logger.info(
      `🚀 Flushing buffer for ${destinationType}: ${totalRows} rows from ${buffer.length} connection(s)`,
      jobId
    );

    try {
      const adapter = getAdapter(destinationType);
      if (!adapter) {
        logger.error(`No adapter found for ${destinationType}`, jobId);
        return;
      }

      // Send each connection's data separately (maintains metadata)
      // If some items fail after retries, keep them in the buffer for next attempt
      const failedItems: BufferedData[] = [];

      for (const item of buffer) {
        let attempt = 0;
        const maxAttempts = 3;
        let sent = false;
        let lastError: any = null;

        while (attempt < maxAttempts && !sent) {
          try {
            const result = await adapter.send(
              item.data,
              destination,
              item.meta
            );

            if (result && result.success) {
              sent = true;
              logger.info(
                `\u2713 Sent ${item.data.length} rows from ${item.connection.name} to ${destinationType}`,
                jobId
              );
              break;
            } else {
              lastError =
                result?.message || result?.error || "Unknown adapter failure";
              logger.warn(
                `Attempt ${attempt + 1} failed for ${
                  item.connection.name
                } -> ${destinationType}: ${lastError}`,
                jobId
              );
            }
          } catch (err: any) {
            lastError = err;
            logger.warn(
              `Attempt ${attempt + 1} exception for ${
                item.connection.name
              } -> ${destinationType}: ${err?.message || err}`,
              jobId
            );
          }

          attempt++;

          if (!sent && attempt < maxAttempts) {
            // Exponential backoff before retrying
            const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
            await new Promise((res) => setTimeout(res, backoffMs));
          }
        }

        if (!sent) {
          // Record failure and keep item for next round
          failedItems.push(item);
          logger.error(
            `\u2717 Failed to send after ${maxAttempts} attempts from ${item.connection.name} to ${destinationType}: ${lastError}`,
            jobId,
            lastError
          );
        }
      }

      if (failedItems.length === 0) {
        // All items sent successfully - clear buffer and remove backup
        destBuffer.buffer = [];
        destBuffer.lastFlushTime = Date.now();
        await this.removeBackup(bufferKey);
        logger.info(
          `\u2705 Buffer flushed successfully for ${destinationType}`,
          jobId
        );
      } else {
        // Some items failed - keep them in the buffer and back them up
        destBuffer.buffer = failedItems;
        await this.backupBuffer(bufferKey, destBuffer);
        logger.warn(
          `${failedItems.length} item(s) failed to flush for ${destinationType}, will retry later`,
          jobId
        );
      }
    } catch (error: any) {
      logger.error(
        `Failed to flush buffer for ${destinationType}: ${error.message}`,
        jobId,
        error
      );
    }
  }

  /**
   * Stop buffering and flush remaining data
   */
  public async stopBuffering(jobId: string): Promise<void> {
    logger.info(`🛑 Stopping buffer, flushing remaining data...`, jobId);

    // Stop auto-flush timer
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush all remaining buffers
    await this.flushAllBuffers();

    // Clear buffers
    this.buffers.clear();

    logger.info(`✅ Buffer stopped and cleared`, jobId);
  }

  /**
   * Backup buffer to file for crash recovery
   */
  private async backupBuffer(
    bufferKey: string,
    destBuffer: DestinationBuffer
  ): Promise<void> {
    try {
      const backupFile = path.join(this.BACKUP_DIR, `${bufferKey}.json`);
      const backupData = {
        timestamp: Date.now(),
        destinationType: destBuffer.destinationType,
        destination: destBuffer.destination,
        buffer: destBuffer.buffer.map((item) => ({
          connectionId: item.connection.id,
          connectionName: item.connection.name,
          rowCount: item.data.length,
          data: item.data,
          meta: item.meta,
        })),
      };

      await fs.promises.writeFile(
        backupFile,
        JSON.stringify(backupData, null, 2)
      );
    } catch (error: any) {
      // Don't fail the job if backup fails
      logger.warn(
        `Failed to backup buffer ${bufferKey}: ${error.message}`,
        this.jobId
      );
    }
  }

  /**
   * Remove backup file after successful flush
   */
  private async removeBackup(bufferKey: string): Promise<void> {
    try {
      const backupFile = path.join(this.BACKUP_DIR, `${bufferKey}.json`);
      if (fs.existsSync(backupFile)) {
        await fs.promises.unlink(backupFile);
      }
    } catch (error: any) {
      // Ignore errors
    }
  }
  private getBufferKey(jobId: string, destinationType: string): string {
    return `${jobId}-${destinationType}`;
  }

  /**
   * Recover buffers from backup files (on app restart)
   */
  public async recoverBuffers(jobId: string): Promise<void> {
    try {
      const files = fs.readdirSync(this.BACKUP_DIR);
      const jobBackups = files.filter((f) => f.startsWith(jobId));

      if (jobBackups.length === 0) return;

      logger.info(
        `🔄 Recovering ${jobBackups.length} buffer(s) from backup...`,
        jobId
      );

      for (const file of jobBackups) {
        const backupFile = path.join(this.BACKUP_DIR, file);
        const backupData = JSON.parse(
          fs.readFileSync(backupFile, "utf-8")
        ) as any;

        // Recreate buffer
        const key = file.replace(".json", "");
        this.buffers.set(key, {
          destinationType: backupData.destinationType,
          destination: backupData.destination,
          buffer: backupData.buffer,
          lastFlushTime: backupData.timestamp,
        });
      }

      logger.info(`✅ Buffer recovery completed`, jobId);
    } catch (error: any) {
      logger.warn(`Buffer recovery failed: ${error.message}`, jobId);
    }
  }
}
