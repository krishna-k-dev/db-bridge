import { SQLConnector } from "../connectors/sql";
import { Job, JobMeta, SQLConnection } from "../types";
import { getAdapter } from "../adapters";
import { shouldTrigger } from "./trigger";
import { logger } from "./logger";

export class JobExecutor {
  async executeJobMultiConnection(
    job: Job,
    connections: SQLConnection[]
  ): Promise<void> {
    if (!job.enabled) {
      logger.info(`Job ${job.name} is disabled, skipping`, job.id);
      return;
    }

    if (!connections || connections.length === 0) {
      throw new Error(`No connections found for job: ${job.name}`);
    }

    logger.info(
      `Starting job: ${job.name} on ${connections.length} connection(s)`,
      job.id
    );

    // Execute query on all connections and collect data with metadata
    const dataWithMeta: Array<{
      connection: SQLConnection;
      data: any[];
      connectionFailedMessage?: string;
    }> = [];

    for (const connection of connections) {
      const connector = new SQLConnector();

      try {
        await connector.connect(connection);
        const data = await connector.executeQuery(job.query);
        logger.info(
          `Query on ${connection.name} returned ${data.length} rows`,
          job.id
        );

        dataWithMeta.push({ connection, data });
      } catch (error: any) {
        logger.error(
          `Failed to execute on ${connection.name}: ${error.message}`,
          job.id,
          error
        );
        // Include failed connection with error message
        dataWithMeta.push({
          connection,
          data: [],
          connectionFailedMessage: error.message,
        });
      } finally {
        await connector.disconnect();
      }
    }

    if (dataWithMeta.length === 0) {
      logger.warn("No data retrieved from any connection", job.id);
      return;
    }

    // Update last run time
    job.lastRun = new Date();

    // Send to all destinations with smart handling
    for (const destination of job.destinations) {
      const adapter = getAdapter(destination.type);

      if (!adapter) {
        logger.error(`Unknown adapter type: ${destination.type}`, job.id);
        continue;
      }

      logger.info(`Sending to ${destination.type}...`, job.id);

      try {
        // FORCE multi-connection - check multiple ways
        const adapterAny = adapter as any;
        let sendMultiConn = adapterAny.sendMultiConnection;

        // Debug logging
        logger.info(
          `🔍 DEBUG: Checking ${
            destination.type
          } - has sendMultiConnection: ${typeof sendMultiConn}`,
          job.id
        );
        logger.info(
          `🔍 DEBUG: Adapter keys: ${Object.keys(adapterAny).join(", ")}`,
          job.id
        );

        if (typeof sendMultiConn === "function") {
          // MULTI-CONNECTION MODE
          logger.info(
            `✅ MULTI-CONNECTION MODE for ${destination.type} with ${dataWithMeta.length} connection(s)`,
            job.id
          );

          const result = await sendMultiConn.call(
            adapter,
            dataWithMeta,
            destination,
            { jobId: job.id, jobName: job.name, runTime: job.lastRun }
          );

          if (result.success) {
            logger.info(result.message, job.id);
          } else {
            logger.error(result.message, job.id, result.error);
          }
        } else {
          // FALLBACK MODE
          logger.warn(
            `⚠️ Adapter ${
              destination.type
            } does NOT have sendMultiConnection method! Type: ${typeof sendMultiConn}`,
            job.id
          );
          logger.warn(
            `⚠️ Falling back to separate sends for each connection`,
            job.id
          );
          // Fallback: Send each connection separately
          for (const { connection, data } of dataWithMeta) {
            // Check if we should trigger based on data
            if (!shouldTrigger(job, data)) {
              logger.info(
                `Trigger condition not met for ${connection.name}, skipping`,
                job.id
              );
              continue;
            }

            const meta: JobMeta = {
              jobId: job.id,
              jobName: job.name,
              runTime: job.lastRun,
              rowCount: data.length,
              connectionId: connection.id,
              connectionName: connection.name,
              financialYear: connection.financialYear || "",
              group: connection.group || "self",
              partner:
                connection.group === "partner" ? connection.partner || "" : "",
            } as any;

            const result = await adapter.send(data, destination, meta);

            if (result.success) {
              logger.info(`${result.message} (${connection.name})`, job.id);
            } else {
              logger.error(
                `${result.message} (${connection.name})`,
                job.id,
                result.error
              );
            }
          }
        }
      } catch (error: any) {
        logger.error(
          `Failed to send to ${destination.type}: ${error.message}`,
          job.id,
          error
        );
      }
    }

    logger.info(`Job ${job.name} completed successfully`, job.id);
  }

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
        connectionId: connection.id,
        connectionName: connection.name,
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
