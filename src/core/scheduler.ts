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

  private scheduleJob(job: Job): void {
    // Stop existing task if any
    if (this.tasks.has(job.id)) {
      this.tasks.get(job.id)!.stop();
    }

    // Manual mode - don't schedule, only run on demand
    if (job.schedule === "manual") {
      logger.info(
        `Job ${job.name} set to manual mode - will not auto-run`,
        job.id
      );
      return;
    }

    // Parse schedule - support both cron and simple interval (e.g., "2m", "30s")
    let cronExpression = job.schedule;

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

    // Validate and schedule
    if (!cron.validate(cronExpression)) {
      logger.error(`Invalid cron expression: ${cronExpression}`, job.id);
      return;
    }

    const task = cron.schedule(cronExpression, async () => {
      try {
        // Handle both single connection (legacy) and multiple connections
        const connectionIds =
          job.connectionIds || (job.connectionId ? [job.connectionId] : []);

        // Get all connections
        const connections = connectionIds
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
    const connectionIds =
      job.connectionIds || (job.connectionId ? [job.connectionId] : []);

    // Get all connections for this job
    const connections = connectionIds
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
    const targetIds = connectionIds.filter((id) =>
      jobConnectionIds.includes(id)
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

  getSettings(): any {
    try {
      if (!fs.existsSync(this.configPath)) {
        return {
          financialYears: [],
          partners: [],
          defaultConnectionTimeout: 30, // Default 30 seconds
          dbPoolMax: 20,
          maxConcurrentConnections: 50,
          jobQueueMaxConcurrent: 10,
          enableProgressStreaming: true,
          logVerbosity: "info",
        };
      }

      const configData = fs.readFileSync(this.configPath, "utf-8");
      const config: any = JSON.parse(configData);

      return {
        financialYears: config.settings?.financialYears || [],
        partners: config.settings?.partners || [],
        defaultConnectionTimeout:
          config.settings?.defaultConnectionTimeout || 30, // Default 30 seconds
        dbPoolMax: config.settings?.dbPoolMax || 20,
        maxConcurrentConnections:
          config.settings?.maxConcurrentConnections || 50,
        jobQueueMaxConcurrent: config.settings?.jobQueueMaxConcurrent || 10,
        enableProgressStreaming:
          typeof config.settings?.enableProgressStreaming === "boolean"
            ? config.settings.enableProgressStreaming
            : true,
        logVerbosity: config.settings?.logVerbosity || "info",
      };
    } catch (error: any) {
      logger.error("Failed to get settings", undefined, error);
      return {
        financialYears: [],
        partners: [],
        defaultConnectionTimeout: 30, // Default 30 seconds
      };
    }
  }

  updateSettings(settings: any): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      let config: any = {
        connections: this.connections,
        jobs: this.jobs,
        settings: this.settings,
      };

      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf-8");
        config = JSON.parse(configData);
      }

      config.settings = settings;

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      logger.info("Settings saved");
    } catch (error: any) {
      logger.error("Failed to save settings", undefined, error);
      throw error;
    }
  }

  // Financial Years Management
  getFinancialYears(): any[] {
    try {
      if (!fs.existsSync(this.configPath)) {
        return [];
      }

      const configData = fs.readFileSync(this.configPath, "utf-8");
      const config: any = JSON.parse(configData);

      return config.settings?.financialYears || [];
    } catch (error: any) {
      logger.error("Failed to get financial years", undefined, error);
      return [];
    }
  }

  createFinancialYear(year: string): any {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      let config: any = {
        connections: this.connections,
        jobs: this.jobs,
        settings: this.settings,
      };

      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf-8");
        config = JSON.parse(configData);
      }

      if (!config.settings) config.settings = {};
      if (!config.settings.financialYears) config.settings.financialYears = [];

      const newFinancialYear = {
        id: Date.now().toString(),
        year: year,
      };

      config.settings.financialYears.push(newFinancialYear);

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      logger.info(`Financial year ${year} created`);
      return newFinancialYear;
    } catch (error: any) {
      logger.error("Failed to create financial year", undefined, error);
      throw error;
    }
  }

  updateFinancialYear(id: string, updates: any): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      let config: any = {
        connections: this.connections,
        jobs: this.jobs,
        settings: this.settings,
      };

      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf-8");
        config = JSON.parse(configData);
      }

      if (!config.settings) config.settings = {};
      if (!config.settings.financialYears) config.settings.financialYears = [];

      const index = config.settings.financialYears.findIndex(
        (fy: any) => fy.id === id
      );
      if (index !== -1) {
        config.settings.financialYears[index] = {
          ...config.settings.financialYears[index],
          ...updates,
        };
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        logger.info(`Financial year ${id} updated`);
      } else {
        throw new Error("Financial year not found");
      }
    } catch (error: any) {
      logger.error("Failed to update financial year", undefined, error);
      throw error;
    }
  }

  deleteFinancialYear(id: string): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      let config: any = {
        connections: this.connections,
        jobs: this.jobs,
        settings: this.settings,
      };

      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf-8");
        config = JSON.parse(configData);
      }

      if (!config.settings) config.settings = {};
      if (!config.settings.financialYears) config.settings.financialYears = [];

      config.settings.financialYears = config.settings.financialYears.filter(
        (fy: any) => fy.id !== id
      );

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      logger.info(`Financial year ${id} deleted`);
    } catch (error: any) {
      logger.error("Failed to delete financial year", undefined, error);
      throw error;
    }
  }

  // Partners Management
  getPartners(): any[] {
    try {
      if (!fs.existsSync(this.configPath)) {
        return [];
      }

      const configData = fs.readFileSync(this.configPath, "utf-8");
      const config: any = JSON.parse(configData);

      return config.settings?.partners || [];
    } catch (error: any) {
      logger.error("Failed to get partners", undefined, error);
      return [];
    }
  }

  createPartner(name: string): any {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      let config: any = {
        connections: this.connections,
        jobs: this.jobs,
        settings: this.settings,
      };

      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf-8");
        config = JSON.parse(configData);
      }

      if (!config.settings) config.settings = {};
      if (!config.settings.partners) config.settings.partners = [];

      const newPartner = {
        id: Date.now().toString(),
        name: name,
      };

      config.settings.partners.push(newPartner);

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      logger.info(`Partner ${name} created`);
      return newPartner;
    } catch (error: any) {
      logger.error("Failed to create partner", undefined, error);
      throw error;
    }
  }

  updatePartner(id: string, updates: any): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      let config: any = {
        connections: this.connections,
        jobs: this.jobs,
        settings: this.settings,
      };

      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf-8");
        config = JSON.parse(configData);
      }

      if (!config.settings) config.settings = {};
      if (!config.settings.partners) config.settings.partners = [];

      const index = config.settings.partners.findIndex((p: any) => p.id === id);
      if (index !== -1) {
        config.settings.partners[index] = {
          ...config.settings.partners[index],
          ...updates,
        };
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        logger.info(`Partner ${id} updated`);
      } else {
        throw new Error("Partner not found");
      }
    } catch (error: any) {
      logger.error("Failed to update partner", undefined, error);
      throw error;
    }
  }

  deletePartner(id: string): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      let config: any = {
        connections: this.connections,
        jobs: this.jobs,
        settings: this.settings,
      };

      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf-8");
        config = JSON.parse(configData);
      }

      if (!config.settings) config.settings = {};
      if (!config.settings.partners) config.settings.partners = [];

      config.settings.partners = config.settings.partners.filter(
        (p: any) => p.id !== id
      );

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      logger.info(`Partner ${id} deleted`);
    } catch (error: any) {
      logger.error("Failed to delete partner", undefined, error);
      throw error;
    }
  }
}
