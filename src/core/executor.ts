import { SQLConnector } from "../connectors/sql";
import { Job, JobMeta, SQLConnection } from "../types";
import { getAdapter } from "../adapters";
import { shouldTrigger } from "./trigger";
import { logger } from "./logger";

export class JobExecutor {
  async executeJob(
    job: Job,
    connection: SQLConnection | undefined
  ): Promise<void> {
    if (!job.enabled) {
      logger.info(`Job ${job.name} is disabled, skipping`, job.id);
      return;
    }

    if (!connection) {
      throw new Error(`Connection not found for job: ${job.name}`);
    }

    logger.info(`Starting job: ${job.name}`, job.id);

    const connector = new SQLConnector();

    try {
      // Connect to database
      await connector.connect(connection);

      // Execute query
      const data = await connector.executeQuery(job.query);
      logger.info(`Query returned ${data.length} rows`, job.id);

      // Check if we should trigger based on data
      if (!shouldTrigger(job, data)) {
        logger.info(
          "Trigger condition not met (data unchanged), skipping send",
          job.id
        );
        return;
      }

      // Update last run time
      job.lastRun = new Date();

      // Create job metadata
      const meta: JobMeta = {
        jobId: job.id,
        jobName: job.name,
        runTime: job.lastRun,
        rowCount: data.length,
      };

      // Send to all destinations
      for (const destination of job.destinations) {
        const adapter = getAdapter(destination.type);

        if (!adapter) {
          logger.error(`Unknown adapter type: ${destination.type}`, job.id);
          continue;
        }

        logger.info(`Sending to ${destination.type}...`, job.id);
        const result = await adapter.send(data, destination, meta);

        if (result.success) {
          logger.info(result.message, job.id);
        } else {
          logger.error(result.message, job.id, result.error);
        }
      }

      logger.info(`Job ${job.name} completed successfully`, job.id);
    } catch (error: any) {
      logger.error(`Job ${job.name} failed: ${error.message}`, job.id, error);
      throw error;
    } finally {
      await connector.disconnect();
    }
  }

  async testJob(
    job: Job,
    connection: SQLConnection | undefined
  ): Promise<{ success: boolean; rowCount: number; message: string }> {
    if (!connection) {
      return {
        success: false,
        rowCount: 0,
        message: `Connection not found`,
      };
    }

    const connector = new SQLConnector();

    try {
      await connector.connect(connection);
      const data = await connector.executeQuery(job.query);

      return {
        success: true,
        rowCount: data.length,
        message: `Query executed successfully. Returned ${data.length} rows.`,
      };
    } catch (error: any) {
      return {
        success: false,
        rowCount: 0,
        message: `Test failed: ${error.message}`,
      };
    } finally {
      await connector.disconnect();
    }
  }

  async testConnection(
    connection: SQLConnection
  ): Promise<{ success: boolean; message: string }> {
    const connector = new SQLConnector();

    try {
      await connector.connect(connection);
      await connector.executeQuery("SELECT 1 AS test");

      return {
        success: true,
        message: `Connected successfully to ${connection.server}/${connection.database}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
      };
    } finally {
      await connector.disconnect();
    }
  }
}
