import * as cron from "node-cron";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { Job, SQLConnection, AppConfig } from "../types";
import { JobExecutor } from "./executor";
import { logger } from "./logger";

export class JobScheduler {
  private jobs: Job[] = [];
  private connections: SQLConnection[] = [];
  private settings: any = {};
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private executor: JobExecutor;
  private configPath: string;

  constructor(configPath?: string) {
    // Use app.getPath('userData') for packaged app
    const userDataPath = app.getPath("userData");
    this.configPath =
      configPath || path.join(userDataPath, "config", "config.json");
    // Initialize executor with settings (will be updated after loading config)
    this.executor = new JobExecutor(this.settings);
  }

  // Normalize server and port to a canonical key for duplicate detection
  private normalizeConnKey(
    conn: Partial<SQLConnection> | SQLConnection
  ): string {
    let server = (conn.server || "").toString().trim();
    let port = (conn as any).port;

    // If server contains a port (e.g., localhost:1433), split it
    if (server.includes(":")) {
      const parts = server.split(":");
      server = parts[0];
      const possiblePort = Number(parts[1]);
      if (!isNaN(possiblePort)) port = possiblePort;
    }

    server = server.toLowerCase();
    const database = ((conn.database || "") as string).toLowerCase();
    const portStr = port ? String(port) : "";
    return `${server}:${portStr}:${database}`;
  }

  loadConfig(): void {
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      if (!fs.existsSync(this.configPath)) {
        logger.warn("Config file not found, creating empty config");
        this.saveConfig();
        return;
      }

      const configData = fs.readFileSync(this.configPath, "utf-8");
      const config: AppConfig = JSON.parse(configData);
      this.connections = config.connections || [];
      this.jobs = config.jobs || [];
      this.settings = config.settings || {};

      // Ensure settings has all required arrays initialized
      if (!this.settings.financialYears) {
        this.settings.financialYears = [];
      }
      if (!this.settings.partners) {
        this.settings.partners = [];
      }
      if (!this.settings.jobGroups) {
        this.settings.jobGroups = [];
      }
      if (!this.settings.systemUsers) {
        this.settings.systemUsers = [];
      }
      if (!this.settings.whatsappGroups) {
        this.settings.whatsappGroups = [];
      }
      // Initialize connection test settings with defaults
      if (this.settings.connectionTestEnabled === undefined) {
        this.settings.connectionTestEnabled = false;
      }
      if (!this.settings.connectionTestInterval) {
        this.settings.connectionTestInterval = 2; // default 2 hours
      }
      if (!this.settings.connectionTestSendTo) {
        this.settings.connectionTestSendTo = "number";
      }
      if (!this.settings.connectionTestWhatsAppGroups) {
        this.settings.connectionTestWhatsAppGroups = [];
      }
      if (this.settings.connectionTestShowFailed === undefined) {
        this.settings.connectionTestShowFailed = true; // default show failed
      }
      if (this.settings.connectionTestShowPassed === undefined) {
        this.settings.connectionTestShowPassed = false; // default hide passed
      }

      // MIGRATION: Convert old format (objects) to new format (strings)
      // Financial Years: {id, year} -> "year"
      if (this.settings.financialYears.length > 0) {
        this.settings.financialYears = this.settings.financialYears.map(
          (item: any) => {
            if (typeof item === "object" && item.year) {
              return item.year; // Extract year string from object
            }
            return item; // Already a string
          }
        );
        logger.info(`Migrated financial years to new format`, undefined, {
          financialYears: this.settings.financialYears,
        });
      }

      // Partners: {id, name} -> "name"
      if (this.settings.partners.length > 0) {
        this.settings.partners = this.settings.partners.map((item: any) => {
          if (typeof item === "object" && item.name) {
            return item.name; // Extract name string from object
          }
          return item; // Already a string
        });
        logger.info(`Migrated partners to new format`, undefined, {
          partners: this.settings.partners,
        });
      }

      // Job Groups: {id, name} -> "name"
      if (this.settings.jobGroups.length > 0) {
        this.settings.jobGroups = this.settings.jobGroups.map((item: any) => {
          if (typeof item === "object" && item.name) {
            return item.name; // Extract name string from object
          }
          return item; // Already a string
        });
        logger.info(`Migrated job groups to new format`, undefined, {
          jobGroups: this.settings.jobGroups,
        });
      }

      // Update executor with loaded settings
      this.executor.updateSettings(this.settings);

      logger.info(
        `Loaded ${this.connections.length} connections and ${this.jobs.length} jobs from config`
      );
    } catch (error: any) {
      logger.error("Failed to load config", undefined, error);
      throw error;
    }
  }

  saveConfig(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const settings = this.getSettings();
      logger.info(`[saveConfig] Settings to save:`, undefined, {
        financialYears: settings.financialYears,
        partners: settings.partners,
        jobGroups: settings.jobGroups,
      });

      const config: AppConfig = {
        connections: this.connections,
        jobs: this.jobs,
        settings: settings,
      };

      const configJson = JSON.stringify(config, null, 2);
      logger.info(`[saveConfig] Writing to: ${this.configPath}`);
      fs.writeFileSync(this.configPath, configJson);

      logger.info("Config saved successfully");
    } catch (error: any) {
      logger.error("Failed to save config", undefined, error);
      throw error;
    }
  }

  startAll(): void {
    logger.info("Starting all scheduled jobs");

    for (const job of this.jobs) {
      if (job.enabled) {
        this.scheduleJob(job);
      }
    }
  }

  stopAll(): void {
    logger.info("Stopping all scheduled jobs");

    for (const [jobId, task] of this.tasks) {
      task.stop();
      logger.info(`Stopped job: ${jobId}`);
    }

    this.tasks.clear();
  }

  rescheduleAllJobs(): void {
    logger.info("Rescheduling all jobs");

    for (const job of this.jobs) {
      if (job.enabled) {
        this.scheduleJob(job);
      } else if (this.tasks.has(job.id)) {
        this.tasks.get(job.id)!.stop();
        this.tasks.delete(job.id);
      }
    }
  }

  private scheduleJob(job: Job): void {
    // Stop existing task if any
    if (this.tasks.has(job.id)) {
      this.tasks.get(job.id)!.stop();
    }

    // Parse schedule - support both cron and simple interval (e.g., "2m", "30s").
    // New recurrenceType values (daily, every-n-days) take precedence when present.
    let cronExpression = job.schedule;

    // Check recurrenceType FIRST - if it's set, use it (don't check schedule === "manual" first)
    if (job.recurrenceType) {
      if (job.recurrenceType === "daily") {
        // Prefer timeOfDay for daily recurrence, but be tolerant:
        // - if timeOfDay present and valid -> generate daily cron
        // - else if schedule already contains a valid cron -> use it (fallback)
        // - otherwise treat as manual (incomplete)
        if (job.timeOfDay) {
          const timeParts = job.timeOfDay.split(":").map(Number);
          if (
            timeParts.length === 2 &&
            !isNaN(timeParts[0]) &&
            !isNaN(timeParts[1])
          ) {
            const [hours, minutes] = timeParts;
            cronExpression = `${minutes} ${hours} * * *`;
            logger.info(
              `Generated daily cron for job ${job.name}: ${cronExpression} (timeOfDay: ${job.timeOfDay})`,
              job.id
            );
          } else {
            logger.warn(
              `Invalid timeOfDay format for job ${job.name}: ${job.timeOfDay}`,
              job.id
            );
            // fall through to try using existing cron in job.schedule
            if (cron.validate(job.schedule || "")) {
              cronExpression = job.schedule;
              logger.info(
                `Falling back to cron expression for job ${job.name}: ${cronExpression}`,
                job.id
              );
            } else {
              logger.warn(
                `No valid timeOfDay or cron for daily job ${job.name}, treating as manual`,
                job.id
              );
              return;
            }
          }
        } else if (cron.validate(job.schedule || "")) {
          // No timeOfDay provided but a cron exists in schedule — accept it.
          cronExpression = job.schedule;
          logger.info(
            `Daily recurrence for job ${job.name} missing timeOfDay, using provided cron: ${cronExpression}`,
            job.id
          );
        } else {
          logger.warn(
            `Job ${job.name} has recurrenceType 'daily' but no timeOfDay or valid cron set, treating as manual`,
            job.id
          );
          return;
        }
      } else if (job.recurrenceType === "every-n-days") {
        // every-n-days requires everyNDays and timeOfDay; try to be tolerant and fall back to cron
        if (job.everyNDays && job.timeOfDay) {
          const timeParts = job.timeOfDay.split(":").map(Number);
          if (
            timeParts.length === 2 &&
            !isNaN(timeParts[0]) &&
            !isNaN(timeParts[1])
          ) {
            const [hours, minutes] = timeParts;
            cronExpression = `${minutes} ${hours} */${job.everyNDays} * *`;
            logger.info(
              `Generated every-n-days cron for job ${job.name}: ${cronExpression} (every ${job.everyNDays} days at ${job.timeOfDay})`,
              job.id
            );
          } else {
            logger.warn(
              `Invalid timeOfDay format for job ${job.name}: ${job.timeOfDay}`,
              job.id
            );
            if (cron.validate(job.schedule || "")) {
              cronExpression = job.schedule;
              logger.info(
                `Falling back to cron expression for job ${job.name}: ${cronExpression}`,
                job.id
              );
            } else {
              logger.warn(
                `No valid every-n-days settings or cron for job ${job.name}, treating as manual`,
                job.id
              );
              return;
            }
          }
        } else if (cron.validate(job.schedule || "")) {
          cronExpression = job.schedule;
          logger.info(
            `every-n-days recurrence missing details for job ${job.name}, using provided cron: ${cronExpression}`,
            job.id
          );
        } else {
          logger.warn(
            `Job ${job.name} has recurrenceType 'every-n-days' but missing everyNDays/timeOfDay and no cron, treating as manual`,
            job.id
          );
          return;
        }
      } else if ((job as any).recurrenceType === "custom") {
        // Legacy/custom marker - explicit cron expression is in job.schedule, use it.
      } else if (job.recurrenceType === "once") {
        // once/manual - don't schedule
        logger.info(
          `Job ${job.name} set to manual/once mode - will not auto-run`,
          job.id
        );
        return;
      } else {
        // Unknown recurrence type: try to use provided cron (backwards compatible)
        if (cron.validate(job.schedule || "")) {
          cronExpression = job.schedule;
          logger.info(
            `Unknown recurrenceType for job ${job.name}, using provided cron: ${cronExpression}`,
            job.id
          );
        } else {
          logger.warn(
            `Job ${job.name} has incomplete recurrence settings, treating as manual`,
            job.id
          );
          return;
        }
      }
    } else {
      // No recurrenceType set — fall back to legacy behavior
      // Manual mode - don't schedule, only run on demand
      if (job.schedule === "manual") {
        logger.info(
          `Job ${job.name} set to manual mode - will not auto-run`,
          job.id
        );
        return;
      }

      // If timeOfDay exists, it means daily (legacy behavior)
      if (job.timeOfDay) {
        const timeParts = job.timeOfDay.split(":").map(Number);
        if (
          timeParts.length === 2 &&
          !isNaN(timeParts[0]) &&
          !isNaN(timeParts[1])
        ) {
          const [hours, minutes] = timeParts;
          cronExpression = `${minutes} ${hours} * * *`;
          logger.info(
            `Generated daily cron for job ${job.name}: ${cronExpression} (timeOfDay: ${job.timeOfDay})`,
            job.id
          );
        } else {
          logger.warn(
            `Invalid timeOfDay format for job ${job.name}: ${job.timeOfDay}, treating as manual`,
            job.id
          );
          return;
        }
      } else {
        // Convert simple interval to cron if needed
        if (/^\d+[ms]$/.test(job.schedule)) {
          const match = job.schedule.match(/^(\d+)([ms])$/);
          if (match) {
            const value = parseInt(match[1]);
            const unit = match[2];

            if (unit === "m") {
              // Every N minutes
              cronExpression = `*/${value} * * * *`;
            } else if (unit === "s") {
              // Every N seconds (note: node-cron doesn't support seconds, use minimum 1 minute)
              logger.warn(
                `Seconds not supported in cron, converting ${value}s to 1 minute`,
                job.id
              );
              cronExpression = "* * * * *";
            }
          }
        }
      }
    }

    // Validate and schedule
    if (!cron.validate(cronExpression)) {
      logger.error(`Invalid cron expression: ${cronExpression}`, job.id);
      return;
    }

    const task = cron.schedule(cronExpression, async () => {
      try {
        // Handle both single connection (legacy) and multiple connections
        const rawConnectionIds =
          job.connectionIds || (job.connectionId ? [job.connectionId] : []);

        // Deduplicate connection IDs and map to existing connections
        const uniqueIds = Array.from(new Set(rawConnectionIds || []));

        // Get all connections (only those that still exist)
        const connections = uniqueIds
          .map((id) => this.getConnection(id))
          .filter(Boolean) as SQLConnection[];

        if (connections.length === 0) {
          logger.error("No valid connections found for job", job.id);
          return;
        }

        // Execute job with multiple connections (smart handling per adapter)
        await this.executor.executeJobMultiConnection(job, connections);
      } catch (error) {
        // Error already logged in executor
      }
    });

    this.tasks.set(job.id, task);
    logger.info(
      `Scheduled job: ${job.name} with schedule: ${cronExpression}`,
      job.id
    );
  }

  addJob(job: Job): void {
    // Ensure job has an id (renderer may send job without id for duplication)
    if (!job.id) {
      job.id = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Ensure required defaults
    job.destinations = job.destinations || [];
    job.enabled = typeof job.enabled === "boolean" ? job.enabled : true;

    this.jobs.push(job);
    this.saveConfig();

    if (job.enabled) {
      this.scheduleJob(job);
    }

    logger.info(`Added new job: ${job.name}`, job.id);
  }

  updateJob(jobId: string, updates: Partial<Job>): void {
    const index = this.jobs.findIndex((j) => j.id === jobId);

    if (index === -1) {
      throw new Error(`Job not found: ${jobId}`);
    }

    this.jobs[index] = { ...this.jobs[index], ...updates };
    this.saveConfig();

    // Reschedule if enabled
    if (this.jobs[index].enabled) {
      this.scheduleJob(this.jobs[index]);
    } else if (this.tasks.has(jobId)) {
      this.tasks.get(jobId)!.stop();
      this.tasks.delete(jobId);
    }

    logger.info(`Updated job: ${jobId}`);
  }

  deleteJob(jobId: string): void {
    const index = this.jobs.findIndex((j) => j.id === jobId);

    if (index === -1) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Stop task if running
    if (this.tasks.has(jobId)) {
      this.tasks.get(jobId)!.stop();
      this.tasks.delete(jobId);
    }

    this.jobs.splice(index, 1);
    this.saveConfig();

    logger.info(`Deleted job: ${jobId}`);
  }

  getJobs(): Job[] {
    return this.jobs;
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.find((j) => j.id === jobId);
  }

  async runJobNow(jobId: string): Promise<void> {
    const job = this.getJob(jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Handle both single connection (legacy) and multiple connections
    const rawConnectionIds =
      job.connectionIds || (job.connectionId ? [job.connectionId] : []);

    // Deduplicate and map to existing connections
    const uniqueIds = Array.from(new Set(rawConnectionIds || []));

    // Get all connections for this job
    const connections = uniqueIds
      .map((id) => this.getConnection(id))
      .filter((conn): conn is any => conn !== undefined);

    if (connections.length === 0) {
      logger.error("No valid connections found for job", job.id);
      return;
    }

    // Use multi-connection execution mode
    try {
      await this.executor.executeJobMultiConnection(job, connections);
    } catch (error) {
      logger.error(
        `Failed to execute job in multi-connection mode`,
        job.id,
        error as Error
      );
    }
  }

  /**
   * Run a job only for a subset of its configured connections (used for retrying failed connections)
   */
  async runJobForConnections(
    jobId: string,
    connectionIds: string[]
  ): Promise<void> {
    const job = this.getJob(jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Determine connections selected for retry (ensure they belong to this job)
    const jobConnectionIds =
      job.connectionIds || (job.connectionId ? [job.connectionId] : []);
    const uniqueJobIds = Array.from(new Set(jobConnectionIds || []));
    const targetIds = Array.from(new Set(connectionIds || [])).filter((id) =>
      uniqueJobIds.includes(id)
    );

    if (targetIds.length === 0) {
      throw new Error("No valid connections selected for retry");
    }

    const connections = targetIds
      .map((id) => this.getConnection(id))
      .filter(Boolean) as any[];

    if (connections.length === 0) {
      throw new Error("No valid connections found for the selected IDs");
    }

    // Execute only on the selected connections
    try {
      await this.executor.executeJobMultiConnection(job, connections);
    } catch (error) {
      // Executor logs errors
    }
  }

  async testJob(jobId: string): Promise<any> {
    const job = this.getJob(jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // For testing, use the first available connection
    const connectionIds =
      job.connectionIds || (job.connectionId ? [job.connectionId] : []);
    const firstConnectionId = connectionIds.find((id) => id);

    if (!firstConnectionId) {
      throw new Error(`No valid connections found for job: ${job.name}`);
    }

    return await this.executor.testJob(
      job,
      this.getConnection(firstConnectionId)
    );
  }

  // Connection Management
  getConnections(): SQLConnection[] {
    return this.connections;
  }

  getConnection(connectionId: string): SQLConnection | undefined {
    return this.connections.find((c) => c.id === connectionId);
  }

  addConnection(connection: SQLConnection): void {
    // If a connection with same id already exists, treat this as an update
    if (connection.id) {
      const existing = this.getConnection(connection.id);
      if (existing) {
        // Merge updates into existing connection
        this.updateConnection(connection.id, connection);
        logger.info(
          `Connection ${connection.id} already exists - updated instead of adding`
        );
        return;
      }
    }

    // Defensive: avoid adding exact duplicate connection by normalized server/database/port
    const newKey = this.normalizeConnKey(connection);
    const duplicate = this.connections.find(
      (c) => this.normalizeConnKey(c) === newKey
    );
    if (duplicate) {
      logger.warn(
        `Attempted to add duplicate connection for ${connection.server}/${connection.database} - updating existing connection (${duplicate.id}) instead`
      );
      this.updateConnection(duplicate.id, connection);
      return;
    }

    this.connections.push(connection);
    this.saveConfig();
    logger.info(`Added connection: ${connection.name}`);
  }

  updateConnection(
    connectionId: string,
    updates: Partial<SQLConnection>
  ): void {
    const index = this.connections.findIndex((c) => c.id === connectionId);

    if (index === -1) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    this.connections[index] = { ...this.connections[index], ...updates };
    // After updating, ensure we don't now collide with another connection
    const updated = this.connections[index];
    const updatedKey = this.normalizeConnKey(updated);

    // Remove any other connections that now match the same normalized key
    const duplicates = this.connections.filter(
      (c) => c.id !== connectionId && this.normalizeConnKey(c) === updatedKey
    );

    if (duplicates.length > 0) {
      for (const dup of duplicates) {
        const dupIndex = this.connections.findIndex((c) => c.id === dup.id);
        if (dupIndex !== -1) {
          this.connections.splice(dupIndex, 1);
          logger.warn(
            `Removed duplicate connection ${dup.id} after update of ${connectionId}`
          );
        }
      }
    }

    this.saveConfig();
    logger.info(`Updated connection: ${connectionId}`);
  }

  deleteConnection(connectionId: string): void {
    // Check if any jobs are using this connection
    const jobsUsingConnection = this.jobs.filter(
      (j) => j.connectionId === connectionId
    );

    if (jobsUsingConnection.length > 0) {
      const jobNames = jobsUsingConnection.map(j => `"${j.name}"`).join(", ");
      throw new Error(
        `Cannot delete connection. ${jobsUsingConnection.length} job(s) are using it: ${jobNames}`
      );
    }

    const index = this.connections.findIndex((c) => c.id === connectionId);

    if (index === -1) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    this.connections.splice(index, 1);
    this.saveConfig();
    logger.info(`Deleted connection: ${connectionId}`);
  }

  duplicateConnection(connectionId: string): SQLConnection {
    const originalConnection = this.getConnection(connectionId);

    if (!originalConnection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    // Create a duplicate with a new ID and modified name
    const duplicatedConnection: SQLConnection = {
      ...originalConnection,
      // Ensure new unique id
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `${originalConnection.name} (Copy)`,
    };

    // When duplicating we want a true separate entry even if server/database/port
    // match an existing connection. Calling addConnection would try to deduplicate
    // based on server/database/port and update the existing entry instead of
    // creating a new one. Push directly to the connections array to preserve
    // the original and create a distinct duplicate entry.
    this.connections.push(duplicatedConnection);
    this.saveConfig();

    logger.info(
      `Duplicated connection: ${connectionId} -> ${duplicatedConnection.id}`
    );

    return duplicatedConnection;
  }

  async testConnection(
    connectionId: string
  ): Promise<{ success: boolean; message: string }> {
    const connection = this.getConnection(connectionId);

    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    const result = await this.executor.testConnection(connection);

    // Update connection test status, timestamp, and which server connected
    connection.lastTested = new Date();
    connection.testStatus = result.success ? "connected" : "failed";
    if (result.success && result.activeServerType) {
      connection.activeServerType = result.activeServerType;
    }

    // Save the updated connection
    this.saveConfig();

    return result;
  }

  /**
   * Test multiple connections in true parallel with per-connection timeout.
   * All connections start testing simultaneously, total time <= timeout.
   * Returns array of results { connectionId, success, message }
   */
  async bulkTestConnections(
    connectionIds: string[],
    concurrency = 5 // Kept for backward compatibility but not used in parallel mode
  ): Promise<{ connectionId: string; success: boolean; message: string }[]> {
    // Get timeout from settings (in seconds), minimum 30 seconds
    const settingsTimeoutSec = this.settings?.defaultConnectionTimeout || 30;
    const timeoutMs = Math.max(settingsTimeoutSec * 1000, 30000); // Minimum 30 seconds

    // Create test promises for all connections - they will run in parallel
    const testPromises = connectionIds.map(async (connectionId) => {
      const startTime = Date.now();
      const connection = this.getConnection(connectionId);

      if (!connection) {
        return {
          connectionId,
          success: false,
          message: "Connection not found",
          connection: null,
        };
      }

      let result;
      try {
        logger.info(`Testing connection: ${connection.name} (${connectionId})`);

        // Create a timeout promise that rejects
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => {
            logger.warn(
              `Connection timeout: ${connection.name} after ${timeoutMs}ms`
            );
            reject(new Error(`Timeout after ${timeoutMs}ms`));
          }, timeoutMs)
        );

        // Race the test against timeout
        result = await Promise.race([
          this.executor.testConnection(connection),
          timeoutPromise,
        ]);

        const duration = Date.now() - startTime;
        logger.info(
          `Connection test completed: ${connection.name} - ${
            result.success ? "SUCCESS" : "FAILED"
          } (${duration}ms)`
        );
      } catch (err: any) {
        const duration = Date.now() - startTime;
        logger.error(
          `Connection test error: ${connection.name} - ${err?.message} (${duration}ms)`,
          connectionId,
          err
        );
        result = { success: false, message: err?.message || String(err) };
      }

      // Update connection status, timestamp, and active server type
      connection.lastTested = new Date();
      connection.testStatus = result.success ? "connected" : "failed";
      if (result.success && result.activeServerType) {
        connection.activeServerType = result.activeServerType;
      }

      return {
        connectionId,
        success: !!result.success,
        message: result.message,
        connection,
      };
    });

    // Wait for ALL tests to complete (not settle early)
    logger.info(
      `Waiting for all ${testPromises.length} connection tests to complete...`
    );
    const settledResults = await Promise.allSettled(testPromises);
    logger.info(`All connection tests completed`);

    // Process results
    const results: {
      connectionId: string;
      success: boolean;
      message: string;
    }[] = [];
    const updatedConnections: SQLConnection[] = [];

    settledResults.forEach((settled, index) => {
      if (settled.status === "fulfilled") {
        const { connectionId, success, message, connection } = settled.value;
        results.push({ connectionId, success, message });
        if (connection) {
          updatedConnections.push(connection);
        }
      } else {
        // This shouldn't happen with our implementation, but handle it just in case
        logger.error(
          "Unexpected rejection in bulk test",
          connectionIds[index],
          settled.reason
        );
        results.push({
          connectionId: connectionIds[index] || "unknown",
          success: false,
          message: `Unexpected error: ${settled.reason}`,
        });
      }
    });

    logger.info(
      `Bulk test results: ${
        results.filter((r) => r.success).length
      } succeeded, ${results.filter((r) => !r.success).length} failed`
    );

    // Save config once after all tests complete
    try {
      this.saveConfig();
    } catch (e) {
      logger.error(
        "Failed to save config after bulk test",
        undefined,
        e as Error
      );
    }

    return results;
  }

  // Settings methods
  getSettings(): any {
    // Ensure settings always has the required properties
    return {
      financialYears: this.settings.financialYears || [],
      partners: this.settings.partners || [],
      jobGroups: this.settings.jobGroups || [],
      ...this.settings,
    };
  }

  updateSettings(newSettings: any): void {
    this.settings = { ...this.settings, ...newSettings };
    // Update executor with new settings
    this.executor.updateSettings(this.settings);
    this.saveConfig();
  }

  getFinancialYears(): string[] {
    const years = this.settings.financialYears || [];
    // Handle both old format (objects with id/year) and new format (strings)
    if (years.length > 0 && typeof years[0] === "object" && years[0].year) {
      return years.map((item: any) => item.year);
    }
    return years;
  }

  createFinancialYear(year: string): string {
    logger.info(
      `[createFinancialYear] Called with year: "${year}"`,
      undefined,
      { year, type: typeof year }
    );

    if (!this.settings.financialYears) {
      logger.info(`[createFinancialYear] Initializing financialYears array`);
      this.settings.financialYears = [];
    }

    logger.info(`[createFinancialYear] Current financialYears:`, undefined, {
      financialYears: this.settings.financialYears,
    });

    // Validate: year must not be empty or whitespace only
    if (!year || !year.trim()) {
      logger.error(`[createFinancialYear] Validation failed - empty year`);
      throw new Error("Financial year cannot be empty");
    }
    const trimmedYear = year.trim();
    logger.info(`[createFinancialYear] Trimmed year: "${trimmedYear}"`);

    // Check if already exists (handle both old and new format)
    const alreadyExists = this.settings.financialYears.some((item: any) => {
      if (typeof item === "object" && item.year) {
        return item.year === trimmedYear;
      }
      return item === trimmedYear;
    });

    if (alreadyExists) {
      logger.error(`[createFinancialYear] Already exists: ${trimmedYear}`);
      throw new Error(`Financial year ${trimmedYear} already exists`);
    }

    logger.info(`[createFinancialYear] Adding year to array: "${trimmedYear}"`);
    this.settings.financialYears.push(trimmedYear);
    logger.info(`[createFinancialYear] After push:`, undefined, {
      financialYears: this.settings.financialYears,
    });

    this.saveConfig();
    logger.info(`[createFinancialYear] Config saved successfully`);

    return trimmedYear;
  }

  updateFinancialYear(oldYear: string, newYear: string): string {
    if (!this.settings.financialYears) {
      this.settings.financialYears = [];
    }
    // Validate: new year must not be empty or whitespace only
    if (!newYear || !newYear.trim()) {
      throw new Error("Financial year cannot be empty");
    }
    const trimmedNewYear = newYear.trim();
    const index = this.settings.financialYears.findIndex((item: any) => {
      if (typeof item === "object" && item.year) {
        return item.year === oldYear;
      }
      return item === oldYear;
    });
    if (index === -1) {
      throw new Error(`Financial year ${oldYear} not found`);
    }
    if (
      this.settings.financialYears.some((item: any) => {
        if (typeof item === "object" && item.year) {
          return item.year === trimmedNewYear;
        }
        return item === trimmedNewYear;
      })
    ) {
      throw new Error(`Financial year ${trimmedNewYear} already exists`);
    }
    this.settings.financialYears[index] = trimmedNewYear;
    this.saveConfig();
    return trimmedNewYear;
  }

  deleteFinancialYear(year: string): void {
    if (!this.settings.financialYears) {
      this.settings.financialYears = [];
    }
    // Handle both old format (objects) and new format (strings)
    if (
      this.settings.financialYears.length > 0 &&
      typeof this.settings.financialYears[0] === "object"
    ) {
      this.settings.financialYears = this.settings.financialYears.filter(
        (y: any) => y.year !== year
      );
    } else {
      this.settings.financialYears = this.settings.financialYears.filter(
        (y: string) => y !== year
      );
    }
    this.saveConfig();
  }

  getPartners(): string[] {
    const partners = this.settings.partners || [];
    // Handle both old format (objects with id/name) and new format (strings)
    if (
      partners.length > 0 &&
      typeof partners[0] === "object" &&
      partners[0].name
    ) {
      return partners.map((item: any) => item.name);
    }
    return partners;
  }

  createPartner(name: string): string {
    logger.info(`[createPartner] Called with name: "${name}"`, undefined, {
      name,
      type: typeof name,
    });

    if (!this.settings.partners) {
      logger.info(`[createPartner] Initializing partners array`);
      this.settings.partners = [];
    }

    logger.info(`[createPartner] Current partners:`, undefined, {
      partners: this.settings.partners,
    });

    // Validate: name must not be empty or whitespace only
    if (!name || !name.trim()) {
      logger.error(`[createPartner] Validation failed - empty name`);
      throw new Error("Partner name cannot be empty");
    }
    const trimmedName = name.trim();
    logger.info(`[createPartner] Trimmed name: "${trimmedName}"`);

    // Check if already exists (handle both old and new format)
    const alreadyExists = this.settings.partners.some((item: any) => {
      if (typeof item === "object" && item.name) {
        return item.name === trimmedName;
      }
      return item === trimmedName;
    });

    if (alreadyExists) {
      logger.error(`[createPartner] Already exists: ${trimmedName}`);
      throw new Error(`Partner ${trimmedName} already exists`);
    }

    this.settings.partners.push(trimmedName);
    this.saveConfig();

    return trimmedName;
  }

  updatePartner(oldName: string, newName: string): string {
    if (!this.settings.partners) {
      this.settings.partners = [];
    }
    // Validate: new name must not be empty or whitespace only
    if (!newName || !newName.trim()) {
      throw new Error("Partner name cannot be empty");
    }
    const trimmedNewName = newName.trim();
    const index = this.settings.partners.findIndex((item: any) => {
      if (typeof item === "object" && item.name) {
        return item.name === oldName;
      }
      return item === oldName;
    });
    if (index === -1) {
      throw new Error(`Partner ${oldName} not found`);
    }
    if (
      this.settings.partners.some((item: any) => {
        if (typeof item === "object" && item.name) {
          return item.name === trimmedNewName;
        }
        return item === trimmedNewName;
      })
    ) {
      throw new Error(`Partner ${trimmedNewName} already exists`);
    }
    this.settings.partners[index] = trimmedNewName;
    this.saveConfig();
    return trimmedNewName;
  }

  deletePartner(name: string): void {
    if (!this.settings.partners) {
      this.settings.partners = [];
    }
    // Handle both old format (objects) and new format (strings)
    if (
      this.settings.partners.length > 0 &&
      typeof this.settings.partners[0] === "object"
    ) {
      this.settings.partners = this.settings.partners.filter(
        (p: any) => p.name !== name
      );
    } else {
      this.settings.partners = this.settings.partners.filter(
        (p: string) => p !== name
      );
    }
    this.saveConfig();
  }

  getJobGroups(): string[] {
    const jobGroups = this.settings.jobGroups || [];
    if (
      jobGroups.length > 0 &&
      typeof jobGroups[0] === "object" &&
      jobGroups[0].name
    ) {
      return jobGroups.map((item: any) => item.name);
    }
    return jobGroups;
  }

  createJobGroup(name: string): string {
    if (!this.settings.jobGroups) {
      this.settings.jobGroups = [];
    }
    if (this.settings.jobGroups.includes(name)) {
      throw new Error(`Job group ${name} already exists`);
    }
    this.settings.jobGroups.push(name);
    this.saveConfig();
    return name;
  }

  updateJobGroup(oldName: string, newName: string): string {
    if (!this.settings.jobGroups) {
      this.settings.jobGroups = [];
    }
    const index = this.settings.jobGroups.findIndex((item: any) => {
      if (typeof item === "object" && item.name) {
        return item.name === oldName;
      }
      return item === oldName;
    });
    if (index === -1) {
      throw new Error(`Job group ${oldName} not found`);
    }
    if (
      this.settings.jobGroups.some((item: any) => {
        if (typeof item === "object" && item.name) {
          return item.name === newName;
        }
        return item === newName;
      })
    ) {
      throw new Error(`Job group ${newName} already exists`);
    }
    this.settings.jobGroups[index] = newName;
    this.saveConfig();
    return newName;
  }

  deleteJobGroup(name: string): void {
    if (!this.settings.jobGroups) {
      this.settings.jobGroups = [];
    }
    this.settings.jobGroups = this.settings.jobGroups.filter((item: any) => {
      if (typeof item === "object" && item.name) {
        return item.name !== name;
      }
      return item !== name;
    });
    this.saveConfig();
  }

  // Store Management Methods
  getStores(): any[] {
    const stores = this.settings.stores || [];
    return stores;
  }

  createStore(name: string, shortName: string): any {
    logger.info(
      `[createStore] Called with name: "${name}", shortName: "${shortName}"`,
      undefined,
      {
        name,
        shortName,
      }
    );

    if (!this.settings.stores) {
      logger.info(`[createStore] Initializing stores array`);
      this.settings.stores = [];
    }

    // Validate: name and shortName must not be empty
    if (!name || !name.trim()) {
      logger.error(`[createStore] Validation failed - empty name`);
      throw new Error("Store name cannot be empty");
    }
    if (!shortName || !shortName.trim()) {
      logger.error(`[createStore] Validation failed - empty shortName`);
      throw new Error("Store short name cannot be empty");
    }

    const trimmedName = name.trim();
    const trimmedShortName = shortName.trim();

    // Check if already exists (check both name and shortName for uniqueness)
    const nameExists = this.settings.stores.some(
      (store: any) => store.name === trimmedName
    );
    const shortNameExists = this.settings.stores.some(
      (store: any) => store.shortName === trimmedShortName
    );

    if (nameExists) {
      logger.error(`[createStore] Name already exists: ${trimmedName}`);
      throw new Error(`Store with name ${trimmedName} already exists`);
    }
    if (shortNameExists) {
      logger.error(
        `[createStore] Short name already exists: ${trimmedShortName}`
      );
      throw new Error(
        `Store with short name ${trimmedShortName} already exists`
      );
    }

    const newStore = {
      name: trimmedName,
      shortName: trimmedShortName,
    };

    logger.info(`[createStore] Adding store to array:`, undefined, {
      newStore,
    });
    this.settings.stores.push(newStore);

    this.saveConfig();
    logger.info(`[createStore] Config saved successfully`);

    return newStore;
  }

  updateStore(oldShortName: string, name: string, shortName: string): any {
    if (!this.settings.stores) {
      this.settings.stores = [];
    }

    // Validate
    if (!name || !name.trim()) {
      throw new Error("Store name cannot be empty");
    }
    if (!shortName || !shortName.trim()) {
      throw new Error("Store short name cannot be empty");
    }

    const trimmedName = name.trim();
    const trimmedShortName = shortName.trim();

    const index = this.settings.stores.findIndex(
      (store: any) => store.shortName === oldShortName
    );
    if (index === -1) {
      throw new Error(`Store with short name ${oldShortName} not found`);
    }

    // Check if new values conflict with other stores
    const nameConflict = this.settings.stores.some(
      (store: any, i: number) => i !== index && store.name === trimmedName
    );
    const shortNameConflict = this.settings.stores.some(
      (store: any, i: number) =>
        i !== index && store.shortName === trimmedShortName
    );

    if (nameConflict) {
      throw new Error(`Store with name ${trimmedName} already exists`);
    }
    if (shortNameConflict) {
      throw new Error(
        `Store with short name ${trimmedShortName} already exists`
      );
    }

    this.settings.stores[index] = {
      name: trimmedName,
      shortName: trimmedShortName,
    };

    this.saveConfig();
    return this.settings.stores[index];
  }

  deleteStore(shortName: string): void {
    if (!this.settings.stores) {
      this.settings.stores = [];
    }
    this.settings.stores = this.settings.stores.filter(
      (store: any) => store.shortName !== shortName
    );
    this.saveConfig();
  }

  // System Users CRUD
  getSystemUsers(): any[] {
    const users = this.settings.systemUsers || [];
    return users;
  }

  createSystemUser(name: string, number: string, group: string): any {
    logger.info(
      `[createSystemUser] Called with name: "${name}", number: "${number}", group: "${group}"`,
      undefined,
      { name, number, group }
    );

    if (!this.settings.systemUsers) {
      logger.info(`[createSystemUser] Initializing systemUsers array`);
      this.settings.systemUsers = [];
    }

    // Validate: all fields must not be empty
    if (!name || !name.trim()) {
      logger.error(`[createSystemUser] Validation failed - empty name`);
      throw new Error("User name cannot be empty");
    }
    if (!number || !number.trim()) {
      logger.error(`[createSystemUser] Validation failed - empty number`);
      throw new Error("User number cannot be empty");
    }
    if (!group || !group.trim()) {
      logger.error(`[createSystemUser] Validation failed - empty group`);
      throw new Error("User group cannot be empty");
    }

    const trimmedName = name.trim();
    const trimmedNumber = number.trim();
    const trimmedGroup = group.trim();

    // Check if number already exists
    const numberExists = this.settings.systemUsers.some(
      (user: any) => user.number === trimmedNumber
    );

    if (numberExists) {
      logger.error(
        `[createSystemUser] Number already exists: ${trimmedNumber}`
      );
      throw new Error(`User with number ${trimmedNumber} already exists`);
    }

    const newUser = {
      name: trimmedName,
      number: trimmedNumber,
      group: trimmedGroup,
    };

    logger.info(`[createSystemUser] Adding user to array:`, undefined, {
      newUser,
    });
    this.settings.systemUsers.push(newUser);

    this.saveConfig();
    logger.info(`[createSystemUser] Config saved successfully`);

    return newUser;
  }

  updateSystemUser(
    oldNumber: string,
    name: string,
    number: string,
    group: string
  ): any {
    if (!this.settings.systemUsers) {
      this.settings.systemUsers = [];
    }

    // Validate
    if (!name || !name.trim()) {
      throw new Error("User name cannot be empty");
    }
    if (!number || !number.trim()) {
      throw new Error("User number cannot be empty");
    }
    if (!group || !group.trim()) {
      throw new Error("User group cannot be empty");
    }

    const trimmedName = name.trim();
    const trimmedNumber = number.trim();
    const trimmedGroup = group.trim();

    const index = this.settings.systemUsers.findIndex(
      (user: any) => user.number === oldNumber
    );
    if (index === -1) {
      throw new Error(`User with number ${oldNumber} not found`);
    }

    // Check if new number conflicts with other users
    const numberConflict = this.settings.systemUsers.some(
      (user: any, i: number) => i !== index && user.number === trimmedNumber
    );

    if (numberConflict) {
      throw new Error(`User with number ${trimmedNumber} already exists`);
    }

    this.settings.systemUsers[index] = {
      name: trimmedName,
      number: trimmedNumber,
      group: trimmedGroup,
    };

    this.saveConfig();
    return this.settings.systemUsers[index];
  }

  deleteSystemUser(number: string): void {
    if (!this.settings.systemUsers) {
      this.settings.systemUsers = [];
    }
    this.settings.systemUsers = this.settings.systemUsers.filter(
      (user: any) => user.number !== number
    );
    this.saveConfig();
  }

  // WhatsApp Groups CRUD
  getWhatsAppGroups(): any[] {
    return this.settings.whatsappGroups || [];
  }

  createWhatsAppGroup(name: string, groupId: string): any {
    logger.info(
      `[createWhatsAppGroup] Called with name: "${name}", groupId: "${groupId}"`,
      undefined,
      {
        name,
        groupId,
      }
    );

    if (!this.settings.whatsappGroups) {
      logger.info(`[createWhatsAppGroup] Initializing whatsappGroups array`);
      this.settings.whatsappGroups = [];
    }

    // Validate: both fields must not be empty
    if (!name || !name.trim()) {
      logger.error(`[createWhatsAppGroup] Validation failed - empty name`);
      throw new Error("WhatsApp group name cannot be empty");
    }
    if (!groupId || !groupId.trim()) {
      logger.error(`[createWhatsAppGroup] Validation failed - empty groupId`);
      throw new Error("WhatsApp group ID cannot be empty");
    }

    const trimmedName = name.trim();
    const trimmedGroupId = groupId.trim();

    // Check if already exists (check both name and groupId for uniqueness)
    const nameExists = this.settings.whatsappGroups.some(
      (group: any) => group.name === trimmedName
    );
    const groupIdExists = this.settings.whatsappGroups.some(
      (group: any) => group.groupId === trimmedGroupId
    );

    if (nameExists) {
      logger.error(`[createWhatsAppGroup] Name already exists: ${trimmedName}`);
      throw new Error(`WhatsApp group with name ${trimmedName} already exists`);
    }
    if (groupIdExists) {
      logger.error(
        `[createWhatsAppGroup] Group ID already exists: ${trimmedGroupId}`
      );
      throw new Error(
        `WhatsApp group with ID ${trimmedGroupId} already exists`
      );
    }

    const newGroup = {
      name: trimmedName,
      groupId: trimmedGroupId,
    };

    logger.info(`[createWhatsAppGroup] Adding group to array:`, undefined, {
      newGroup,
    });
    this.settings.whatsappGroups.push(newGroup);

    this.saveConfig();
    logger.info(`[createWhatsAppGroup] Config saved successfully`);

    return newGroup;
  }

  updateWhatsAppGroup(oldGroupId: string, name: string, groupId: string): any {
    if (!this.settings.whatsappGroups) {
      this.settings.whatsappGroups = [];
    }

    // Validate
    if (!name || !name.trim()) {
      throw new Error("WhatsApp group name cannot be empty");
    }
    if (!groupId || !groupId.trim()) {
      throw new Error("WhatsApp group ID cannot be empty");
    }

    const trimmedName = name.trim();
    const trimmedGroupId = groupId.trim();

    const index = this.settings.whatsappGroups.findIndex(
      (group: any) => group.groupId === oldGroupId
    );
    if (index === -1) {
      throw new Error(`WhatsApp group with ID ${oldGroupId} not found`);
    }

    // Check if new values conflict with other groups
    const nameConflict = this.settings.whatsappGroups.some(
      (group: any, i: number) => i !== index && group.name === trimmedName
    );
    const groupIdConflict = this.settings.whatsappGroups.some(
      (group: any, i: number) => i !== index && group.groupId === trimmedGroupId
    );

    if (nameConflict) {
      throw new Error(`WhatsApp group with name ${trimmedName} already exists`);
    }
    if (groupIdConflict) {
      throw new Error(
        `WhatsApp group with ID ${trimmedGroupId} already exists`
      );
    }

    this.settings.whatsappGroups[index] = {
      name: trimmedName,
      groupId: trimmedGroupId,
    };

    this.saveConfig();
    return this.settings.whatsappGroups[index];
  }

  deleteWhatsAppGroup(groupId: string): void {
    if (!this.settings.whatsappGroups) {
      this.settings.whatsappGroups = [];
    }
    this.settings.whatsappGroups = this.settings.whatsappGroups.filter(
      (group: any) => group.groupId !== groupId
    );
    this.saveConfig();
  }

  // Connection Test with WhatsApp Notification
  async testAllConnectionsAndNotify(): Promise<{
    success: boolean;
    testedCount: number;
    results: Array<{
      name: string;
      store: string;
      server: string;
      staticServer: string;
      vpnServer?: string;
      activeServerType?: "static" | "vpn";
      status: "success" | "failed";
      message?: string;
    }>;
  }> {
    logger.info("[testAllConnectionsAndNotify] Starting connection test...");

    // Filter connections to get unique IP combinations (static + VPN)
    const uniqueConnections = new Map<string, any>();
    const duplicateConnections = new Map<string, string[]>(); // Track which connections share same IP

    for (const conn of this.connections) {
      const staticServer = conn.server;
      const vpnServer = (conn as any).vpnServer || "";
      const ipKey = `${staticServer}|${vpnServer}`; // Unique key for IP combination

      if (!uniqueConnections.has(ipKey)) {
        uniqueConnections.set(ipKey, conn);
        duplicateConnections.set(ipKey, [conn.name]);
      } else {
        // Track duplicate connection names for this IP
        duplicateConnections.get(ipKey)?.push(conn.name);
      }
    }

    logger.info(
      `[testAllConnectionsAndNotify] Filtered ${this.connections.length} connections to ${uniqueConnections.size} unique IPs`
    );

    // Log which connections share IPs
    for (const [ipKey, names] of duplicateConnections.entries()) {
      if (names.length > 1) {
        logger.info(
          `[testAllConnectionsAndNotify] IP ${ipKey} shared by: ${names.join(
            ", "
          )}`
        );
      }
    }

    // Test only unique connections in PARALLEL for speed
    const uniqueTestResults = await Promise.all(
      Array.from(uniqueConnections.values()).map(async (connection) => {
        try {
          const connector = new (
            await import("../connectors/sql")
          ).SQLConnector();
          await connector.connect(connection);

          // Get which server connected
          const activeServerType =
            (connector as any).config?.activeServerType || "static";

          await connector.disconnect();

          // Update connection with active server type
          connection.activeServerType = activeServerType;
          connection.lastTested = new Date();
          connection.testStatus = "connected";

          return {
            name: connection.name,
            store: connection.store || "-",
            server: connection.server, // Keep legacy field for compatibility
            staticServer: connection.server,
            vpnServer: (connection as any).vpnServer,
            activeServerType: activeServerType,
            status: "success" as const,
          };
        } catch (error: any) {
          // Both static and VPN failed
          connection.lastTested = new Date();
          connection.testStatus = "failed";
          connection.activeServerType = undefined;

          return {
            name: connection.name,
            store: connection.store || "-",
            server: connection.server,
            staticServer: connection.server,
            vpnServer: (connection as any).vpnServer,
            activeServerType: undefined,
            status: "failed" as const,
            message: error.message,
          };
        }
      })
    );

    // Now update ALL connections that share the same IP with the test result
    const results: typeof uniqueTestResults = [];

    for (const testResult of uniqueTestResults) {
      const staticServer = testResult.staticServer;
      const vpnServer = testResult.vpnServer || "";
      const ipKey = `${staticServer}|${vpnServer}`;
      const sharedConnectionNames = duplicateConnections.get(ipKey) || [];

      // For each connection sharing this IP, update its status
      for (const connName of sharedConnectionNames) {
        const conn = this.connections.find((c) => c.name === connName);
        if (conn) {
          conn.activeServerType = testResult.activeServerType;
          conn.lastTested = new Date();
          conn.testStatus =
            testResult.status === "success" ? "connected" : "failed";
        }

        // Add result for this connection to the results array
        results.push({
          ...testResult,
          name: connName,
          store: conn?.store || testResult.store,
        });
      }
    }

    logger.info(
      `[testAllConnectionsAndNotify] Tested ${uniqueConnections.size} unique IPs, applied to ${results.length} total connections`
    );

    // Send WhatsApp notification with all connection results
    await this.sendConnectionTestNotification(results);

    return {
      success: true,
      testedCount: results.length,
      results,
    };
  }

  private async sendConnectionTestNotification(
    results: Array<{
      name: string;
      store: string;
      server: string;
      staticServer: string;
      vpnServer?: string;
      activeServerType?: "static" | "vpn";
      status: "success" | "failed";
      message?: string;
    }>
  ): Promise<void> {
    // Check send to configuration
    const sendTo = this.settings.connectionTestSendTo || "number";
    const systemUsers = this.settings.systemUsers || [];
    const whatsappGroups = this.settings.whatsappGroups || [];

    // Validate recipient configuration
    if (sendTo === "number" && systemUsers.length === 0) {
      logger.info(
        "[sendConnectionTestNotification] No system users configured"
      );
      return;
    }
    if (sendTo === "groups" && whatsappGroups.length === 0) {
      logger.info(
        "[sendConnectionTestNotification] No WhatsApp groups configured"
      );
      return;
    }

    // Get status filter settings
    const showFailed = this.settings.connectionTestShowFailed !== false; // default true
    const showPassed = this.settings.connectionTestShowPassed === true; // default false

    // DEDUPLICATE results by IP combination (static+vpn) before filtering
    const uniqueResultsMap = new Map<string, typeof results[0]>();
    for (const result of results) {
      const staticServer = result.staticServer;
      const vpnServer = result.vpnServer || "";
      const ipKey = `${staticServer}|${vpnServer}`;
      
      // Keep first occurrence only
      if (!uniqueResultsMap.has(ipKey)) {
        uniqueResultsMap.set(ipKey, result);
      }
    }
    
    const uniqueResults = Array.from(uniqueResultsMap.values());
    logger.info(
      `[sendConnectionTestNotification] Deduplicated ${results.length} results to ${uniqueResults.length} unique IPs`
    );

    // Filter results based on status settings
    let filteredResults = uniqueResults;
    if (!showFailed && !showPassed) {
      // If both are false, show failed only (safety fallback)
      filteredResults = uniqueResults.filter((r) => r.status === "failed");
    } else if (showFailed && !showPassed) {
      filteredResults = uniqueResults.filter((r) => r.status === "failed");
    } else if (!showFailed && showPassed) {
      filteredResults = uniqueResults.filter((r) => r.status === "success");
    }
    // If both true, show all (no filter needed)

    if (filteredResults.length === 0) {
      logger.info(
        "[sendConnectionTestNotification] No results to send based on filters"
      );
      return;
    }

    // Format the message
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    let message = "📡 *Connection Test*\n";
    message += "--------------------------------\n";
    message += "*Sno*  *Store*  *Static*  *VPN*  *Active*  *Status*\n";

    filteredResults.forEach((result, index) => {
      const status = result.status === "success" ? "✅ Pass" : "❌ Fail";
      const staticSrv = (result as any).staticServer || "-";
      const vpnSrv = (result as any).vpnServer || "-";

      // Determine active server logic:
      // If test succeeded and we have activeServerType, show it
      // If test failed but only one server configured, show that one
      // Otherwise show "-"
      let active = "-";
      if ((result as any).activeServerType) {
        // Test passed and we know which server connected
        active = (result as any).activeServerType === "vpn" ? "VPN" : "Static";
      } else if (result.status === "failed") {
        // Test failed - show which servers were configured
        const hasStatic = staticSrv !== "-";
        const hasVPN = vpnSrv !== "-";
        if (hasStatic && hasVPN) {
          active = "Both❌"; // Both configured but both failed
        } else if (hasStatic) {
          active = "Static❌"; // Only static configured and failed
        } else if (hasVPN) {
          active = "VPN❌"; // Only VPN configured and failed
        }
      }

      message += `${index + 1}    ${
        result.store
      }    ${staticSrv}    ${vpnSrv}    ${active}    ${status}\n`;
    });

    message += "--------------------------------\n";
    const passedCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    message += `🟢 *Message:* ${passedCount} passed, ${failedCount} failed at ${timeStr}`;

    // Send based on sendTo configuration - to ALL system users or ALL groups
    if (sendTo === "number") {
      // Send to all system users
      logger.info(
        `[sendConnectionTestNotification] Sending to ${systemUsers.length} system users`
      );
      for (const user of systemUsers) {
        await this.sendWhatsAppMessage(user.number, message, false);
      }
    } else if (sendTo === "groups") {
      // Send to all WhatsApp groups
      logger.info(
        `[sendConnectionTestNotification] Sending to ${whatsappGroups.length} WhatsApp groups`
      );
      for (const group of whatsappGroups) {
        await this.sendWhatsAppMessage(group.name, message, true);
      }
    }

    logger.info("[sendConnectionTestNotification] WhatsApp notifications sent");
  }

  private async sendWhatsAppMessage(
    recipient: string,
    message: string,
    isGroup: boolean
  ): Promise<void> {
    try {
      logger.info(
        `[sendWhatsAppMessage] Sending to ${recipient} (group: ${isGroup})`
      );

      const axiosInstance = (await import("axios")).default.create({
        baseURL: "https://whatsapp.rajmandirhypermarket.com",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer cmFqbWFuZGlyLmFkaXR5YTpBZGVlaXNnb29kQDE3MDc",
        },
      });

      // Format according to API documentation
      const payload = isGroup
        ? {
            // Group Message format
            groupName: recipient, // This is actually groupId from our settings
            message: message,
            group: "true",
          }
        : {
            // Individual Message format
            number: recipient,
            message: message,
            group: "false",
          };

      logger.info(`[sendWhatsAppMessage] Sending payload:`, undefined, payload);

      const result = await axiosInstance.post("/api/send", payload);

      logger.info(
        `[sendWhatsAppMessage] API Response:`,
        undefined,
        result.data
      );

      logger.info(
        `[sendWhatsAppMessage] Successfully sent to ${recipient} (group: ${isGroup})`
      );
    } catch (error: any) {
      logger.error(
        `[sendWhatsAppMessage] Failed to send to ${recipient}. Error: ${error.message}`,
        undefined,
        {
          error: error.message,
          response: error.response?.data,
          status: error.response?.status,
        }
      );
    }
  }

  // Schedule connection test job
  startConnectionTestScheduler(): void {
    this.stopConnectionTestScheduler(); // Stop existing if any

    if (!this.settings.connectionTestEnabled) {
      logger.info("[ConnectionTest] Scheduler disabled");
      return;
    }

    // Use connectionTestCron if available (new format), otherwise fallback to interval
    let cronExpression: string;
    if (this.settings.connectionTestCron) {
      cronExpression = this.settings.connectionTestCron;
      logger.info(
        `[ConnectionTest] Starting scheduler with cron: ${cronExpression}`
      );
    } else {
      // Fallback to old interval format
      const intervalHours = this.settings.connectionTestInterval || 2;
      cronExpression = `0 */${intervalHours} * * *`; // Every N hours
      logger.info(
        `[ConnectionTest] Starting scheduler with interval: ${intervalHours} hours (cron: ${cronExpression})`
      );
    }

    const task = cron.schedule(
      cronExpression,
      async () => {
        logger.info("[ConnectionTest] Running scheduled test...");
        try {
          await this.testAllConnectionsAndNotify();
        } catch (error: any) {
          logger.error(
            "[ConnectionTest] Scheduled test failed",
            undefined,
            error
          );
        }
      },
      {
        scheduled: true,
      }
    );

    this.tasks.set("connection-test", task);
    logger.info(
      `[ConnectionTest] Scheduler started successfully with cron: ${cronExpression}`
    );
  }

  stopConnectionTestScheduler(): void {
    const task = this.tasks.get("connection-test");
    if (task) {
      task.stop();
      this.tasks.delete("connection-test");
      logger.info("[ConnectionTest] Scheduler stopped");
    }
  }

  restartConnectionTestScheduler(): void {
    logger.info("[ConnectionTest] Restarting scheduler...");
    this.startConnectionTestScheduler();
  }
}
