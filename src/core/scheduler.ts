import * as cron from "node-cron";
import * as fs from "fs";
import * as path from "path";
import { Job, SQLConnection, AppConfig } from "../types";
import { JobExecutor } from "./executor";
import { logger } from "./logger";

export class JobScheduler {
  private jobs: Job[] = [];
  private connections: SQLConnection[] = [];
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private executor: JobExecutor;
  private configPath: string;

  constructor(configPath?: string) {
    this.executor = new JobExecutor();
    this.configPath =
      configPath || path.join(__dirname, "../../config/config.json");
  }

  loadConfig(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        logger.warn("Config file not found, creating empty config");
        this.saveConfig();
        return;
      }

      const configData = fs.readFileSync(this.configPath, "utf-8");
      const config: AppConfig = JSON.parse(configData);
      this.connections = config.connections || [];
      this.jobs = config.jobs || [];

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
        const connection = this.getConnection(job.connectionId);
        await this.executor.executeJob(job, connection);
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

    const connection = this.getConnection(job.connectionId);
    await this.executor.executeJob(job, connection);
  }

  async testJob(jobId: string): Promise<any> {
    const job = this.getJob(jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    return await this.executor.testJob(
      job,
      this.getConnection(job.connectionId)
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

  async testConnection(
    connectionId: string
  ): Promise<{ success: boolean; message: string }> {
    const connection = this.getConnection(connectionId);

    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    return await this.executor.testConnection(connection);
  }
}
