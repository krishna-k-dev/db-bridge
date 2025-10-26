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
    this.executor = new JobExecutor();
    // Use app.getPath('userData') for packaged app
    const userDataPath = app.getPath("userData");
    this.configPath =
      configPath || path.join(userDataPath, "config", "config.json");
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

      const config: AppConfig = {
        connections: this.connections,
        jobs: this.jobs,
        settings: this.getSettings(),
      };
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

      logger.info("Config saved");
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
      throw new Error(
        `Cannot delete connection. ${jobsUsingConnection.length} job(s) are using it.`
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
      id: `conn_${Date.now()}`,
      name: `${originalConnection.name} (Copy)`,
    };

    this.addConnection(duplicatedConnection);
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

    // Update connection test status and timestamp
    connection.lastTested = new Date();
    connection.testStatus = result.success ? "connected" : "failed";

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

      // Update connection status & timestamp
      connection.lastTested = new Date();
      connection.testStatus = result.success ? "connected" : "failed";

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
    return this.settings;
  }

  updateSettings(newSettings: any): void {
    this.settings = { ...this.settings, ...newSettings };
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
    if (!this.settings.financialYears) {
      this.settings.financialYears = [];
    }
    if (this.settings.financialYears.includes(year)) {
      throw new Error(`Financial year ${year} already exists`);
    }
    this.settings.financialYears.push(year);
    this.saveConfig();
    return year;
  }

  updateFinancialYear(oldYear: string, newYear: string): string {
    if (!this.settings.financialYears) {
      this.settings.financialYears = [];
    }
    const index = this.settings.financialYears.findIndex((item: any) => {
      if (typeof item === "object" && item.name) {
        return item.name === oldYear;
      }
      return item === oldYear;
    });
    if (index === -1) {
      throw new Error(`Financial year ${oldYear} not found`);
    }
    if (
      this.settings.financialYears.some((item: any) => {
        if (typeof item === "object" && item.name) {
          return item.name === newYear;
        }
        return item === newYear;
      })
    ) {
      throw new Error(`Financial year ${newYear} already exists`);
    }
    this.settings.financialYears[index] = newYear;
    this.saveConfig();
    return newYear;
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
    if (!this.settings.partners) {
      this.settings.partners = [];
    }
    if (this.settings.partners.includes(name)) {
      throw new Error(`Partner ${name} already exists`);
    }
    this.settings.partners.push(name);
    this.saveConfig();
    return name;
  }

  updatePartner(oldName: string, newName: string): string {
    if (!this.settings.partners) {
      this.settings.partners = [];
    }
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
          return item.name === newName;
        }
        return item === newName;
      })
    ) {
      throw new Error(`Partner ${newName} already exists`);
    }
    this.settings.partners[index] = newName;
    this.saveConfig();
    return newName;
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
}
