import { SQLConnector } from "../connectors/sql";
import { Job, JobMeta, SQLConnection } from "../types";
import { getAdapter } from "../adapters";
import { shouldTrigger } from "./trigger";
import { logger } from "./logger";
import { ProgressStream } from "./ProgressStream";
import { DataBuffer } from "./DataBuffer";

export class JobExecutor {
  private progressStream: ProgressStream;
  private dataBuffer: DataBuffer;
  private settings: any;

  constructor(settings?: any) {
    this.progressStream = ProgressStream.getInstance();
    this.dataBuffer = DataBuffer.getInstance();
    this.settings = settings || {};
  }

  updateSettings(settings: any): void {
    this.settings = settings || {};
  }

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

    // Deduplicate connections by id to avoid accidentally running the same
    // connection multiple times (defensive guard against upstream bugs).
    const seen = new Set<string>();
    connections = connections.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    // Initialize progress tracking
    this.progressStream.startJob(job.id, job.name, connections.length);
    this.progressStream.updateJobStep(
      job.id,
      "Executing queries on connections"
    );

    // HYBRID BATCHING: Initialize buffer ONLY for Google Sheets (incremental streaming)
    // Custom API and Webhook will send ONCE after all queries complete
    const streamingDestinationTypes = ["google_sheets"];
    const hasStreamingDestinations = job.destinations.some((d) =>
      streamingDestinationTypes.includes(d.type)
    );

    // Start buffering if streaming destinations exist
    if (hasStreamingDestinations) {
      // Provide settings to buffer so adapters (in flush) can enrich payloads
      this.dataBuffer.setSettings(this.settings);
      this.dataBuffer.startBuffering(job.id, job);
      logger.info(
        `📦 Hybrid batching enabled for Google Sheets: Data will be sent every 10 seconds or when buffer reaches 150 rows`,
        job.id
      );
    }

    // Execute query on all connections and collect data with metadata
    const dataWithMeta: Array<{
      connection: SQLConnection;
      data: any[];
      queryResults?: { [queryName: string]: any[] }; // Multi-query results
      connectionFailedMessage?: string;
    }> = [];

    for (const connection of connections) {
      // Check if cancellation has been requested
      if (this.progressStream.isCancellationRequested(job.id)) {
        logger.warn(
          `Job ${job.name} cancelled during connection ${connection.name}`,
          job.id
        );
        this.progressStream.cancelJobComplete(job.id);
        return;
      }

      const connector = new SQLConnector();

      // Start tracking this connection
      this.progressStream.startConnection(
        job.id,
        connection.id,
        connection.name
      );

      try {
        this.progressStream.updateConnectionProgress(job.id, connection.id, {
          step: "Connecting to database",
        });

        await connector.connect(connection);

        this.progressStream.updateConnectionProgress(job.id, connection.id, {
          step: "Executing query",
        });

        // Check cancellation before executing queries
        if (this.progressStream.isCancellationRequested(job.id)) {
          logger.warn(
            `Job ${job.name} cancelled before query execution on ${connection.name}`,
            job.id
          );
          await connector.disconnect();
          this.progressStream.cancelJobComplete(job.id);
          return;
        }

        // Support multi-query: if job.queries exists, execute all; otherwise use legacy job.query
        let data: any[] = [];
        let queryResults: { [queryName: string]: any[] } = {};

        if (job.queries && job.queries.length > 0) {
          // Multi-query mode
          logger.info(
            `Executing ${job.queries.length} queries on ${connection.name}`,
            job.id
          );

          for (const queryItem of job.queries) {
            // Check cancellation before each query
            if (this.progressStream.isCancellationRequested(job.id)) {
              logger.warn(
                `Job ${job.name} cancelled during query "${queryItem.name}" on ${connection.name}`,
                job.id
              );
              await connector.disconnect();
              this.progressStream.cancelJobComplete(job.id);
              return;
            }

            logger.info(
              `Executing query "${queryItem.name}" on ${connection.name}`,
              job.id
            );
            const queryData = await connector.executeQuery(queryItem.query);
            queryResults[queryItem.name] = queryData;

            logger.info(
              `Query "${queryItem.name}" on ${connection.name} returned ${queryData.length} rows`,
              job.id
            );
          }

          // For backward compatibility, combine all results for trigger check
          data = Object.values(queryResults).flat();
        } else {
          // Legacy single query mode
          data = await connector.executeQuery(job.query);

          logger.info(
            `Query on ${connection.name} returned ${data.length} rows`,
            job.id
          );
        }

        this.progressStream.updateConnectionProgress(job.id, connection.id, {
          step: "Query completed",
          rowsProcessed: data.length,
          totalRows: data.length,
        });

        dataWithMeta.push({ connection, data, queryResults });

        // HYBRID BATCHING: Add data to buffer ONLY for Google Sheets
        // Custom API and Webhook will send once after all queries complete
        if (hasStreamingDestinations && data.length > 0) {
          this.progressStream.updateConnectionProgress(job.id, connection.id, {
            step: "Buffering data for Google Sheets",
          });

          await this.dataBuffer.addToBuffer(job.id, job, connection, data);
        }

        // Mark connection as completed
        this.progressStream.completeConnection(
          job.id,
          connection.id,
          data.length
        );
      } catch (error: any) {
        logger.error(
          `Failed to execute on ${connection.name}: ${error.message}`,
          job.id,
          error
        );

        // Mark connection as failed
        this.progressStream.failConnection(
          job.id,
          connection.id,
          error.message
        );

        // Include failed connection with error message
        dataWithMeta.push({
          connection,
          // For API/Webhook, send a data array with a fieldMessage object (for Excel/Sheets, this is handled in the adapter)
          data: [{ fieldMessage: error.message }],
          connectionFailedMessage: error.message,
        });
      } finally {
        await connector.disconnect();
      }
    }

    if (dataWithMeta.length === 0) {
      logger.warn("No data retrieved from any connection", job.id);
      this.progressStream.failJob(
        job.id,
        "No data retrieved from any connection"
      );
      return;
    }

    // Update last run time
    job.lastRun = new Date();

    // Check cancellation before sending to destinations
    if (this.progressStream.isCancellationRequested(job.id)) {
      logger.warn(
        `Job ${job.name} cancelled before sending to destinations`,
        job.id
      );
      this.progressStream.cancelJobComplete(job.id);
      return;
    }

    // Update progress for destination sending
    this.progressStream.updateJobStep(
      job.id,
      `Sending to ${job.destinations.length} destination(s)`
    );

    // Send to all destinations with smart handling
    for (const destination of job.destinations) {
      // If this destination is Google Sheets and hybrid batching is enabled,
      // we rely on DataBuffer to send data incrementally. Skip direct sending.
      // Custom API and Webhook will send directly ONCE after all queries complete.
      const streamingDestinationTypes = ["google_sheets"];

      if (
        hasStreamingDestinations &&
        streamingDestinationTypes.includes(destination.type)
      ) {
        logger.info(
          `Skipping direct send for ${destination.type} because hybrid batching is enabled`,
          job.id
        );
        continue;
      }

      const adapter = getAdapter(destination.type);

      if (!adapter) {
        logger.error(`Unknown adapter type: ${destination.type}`, job.id);
        continue;
      }

      logger.info(`Sending to ${destination.type}...`, job.id);
      this.progressStream.updateJobStep(
        job.id,
        `Sending to ${destination.type}`
      );

      try {
        // Use multi-connection send method
        const adapterAny = adapter as any;
        const sendMultiConn = adapterAny.sendMultiConnection;

        if (typeof sendMultiConn === "function") {
          // Send all connections data in one call
          logger.info(
            `Sending ${dataWithMeta.length} connection(s) to ${destination.type}`,
            job.id
          );

          const result = await sendMultiConn.call(
            adapter,
            dataWithMeta,
            destination,
            {
              jobId: job.id,
              jobName: job.name,
              jobGroup: job.group || "",
              runTime: job.lastRun,
              settings: this.settings,
            }
          );

          if (result.success) {
            logger.info(result.message, job.id);
          } else {
            logger.error(result.message, job.id, result.error);
          }
        } else {
          // Adapter doesn't support multi-connection, send each separately
          logger.info(
            `Adapter ${destination.type} doesn't support multi-connection, sending separately`,
            job.id
          );
          
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
              jobGroup: job.group || "",
              runTime: job.lastRun,
              rowCount: data.length,
              connectionId: connection.id,
              connectionName: connection.database || connection.name,
              settings: this.settings,
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

    // HYBRID BATCHING: Stop buffer and flush remaining data
    if (hasStreamingDestinations) {
      logger.info(
        `🛑 Job completed, flushing remaining buffered data...`,
        job.id
      );
      await this.dataBuffer.stopBuffering(job.id);
    }

    logger.info(`Job ${job.name} completed successfully`, job.id);
    this.progressStream.completeJob(job.id, {
      totalConnections: connections.length,
      successfulConnections: dataWithMeta.filter(
        (d) => !d.connectionFailedMessage
      ).length,
      failedConnections: dataWithMeta.filter((d) => d.connectionFailedMessage)
        .length,
    });
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

    // Initialize progress tracking for single connection
    this.progressStream.startJob(job.id, job.name, 1);
    this.progressStream.startConnection(job.id, connection.id, connection.name);

    const connector = new SQLConnector();

    try {
      // Check cancellation at start
      if (this.progressStream.isCancellationRequested(job.id)) {
        logger.warn(`Job ${job.name} cancelled before connecting`, job.id);
        this.progressStream.cancelJobComplete(job.id);
        return;
      }

      // Connect to database
      this.progressStream.updateConnectionProgress(job.id, connection.id, {
        step: "Connecting to database",
      });

      await connector.connect(connection);

      // Check cancellation before executing query
      if (this.progressStream.isCancellationRequested(job.id)) {
        logger.warn(`Job ${job.name} cancelled before query execution`, job.id);
        await connector.disconnect();
        this.progressStream.cancelJobComplete(job.id);
        return;
      }

      // Execute query
      this.progressStream.updateConnectionProgress(job.id, connection.id, {
        step: "Executing query",
      });

      const data = await connector.executeQuery(job.query);
      logger.info(`Query returned ${data.length} rows`, job.id);

      this.progressStream.updateConnectionProgress(job.id, connection.id, {
        step: "Processing results",
        rowsProcessed: data.length,
        totalRows: data.length,
      });

      // Check if we should trigger based on data
      if (!shouldTrigger(job, data)) {
        logger.info(
          "Trigger condition not met (data unchanged), skipping send",
          job.id
        );
        this.progressStream.completeConnection(
          job.id,
          connection.id,
          data.length
        );
        this.progressStream.completeJob(job.id, {
          skipped: true,
          reason: "Trigger condition not met",
        });
        return;
      }

      // Update last run time
      job.lastRun = new Date();

      // Check cancellation before sending to destinations
      if (this.progressStream.isCancellationRequested(job.id)) {
        logger.warn(
          `Job ${job.name} cancelled before sending to destinations`,
          job.id
        );
        await connector.disconnect();
        this.progressStream.cancelJobComplete(job.id);
        return;
      }

      // Create job metadata
      const meta: JobMeta = {
        jobId: job.id,
        jobName: job.name,
        runTime: job.lastRun,
        rowCount: data.length,
        connectionId: connection.id,
        connectionName: connection.database || connection.name, // Use database name
        settings: this.settings,
      };

      this.progressStream.updateJobStep(
        job.id,
        `Sending to ${job.destinations.length} destination(s)`
      );

      // Send to all destinations
      for (const destination of job.destinations) {
        const adapter = getAdapter(destination.type);

        if (!adapter) {
          logger.error(`Unknown adapter type: ${destination.type}`, job.id);
          continue;
        }

        logger.info(`Sending to ${destination.type}...`, job.id);
        this.progressStream.updateJobStep(
          job.id,
          `Sending to ${destination.type}`
        );

        const result = await adapter.send(data, destination, meta);

        if (result.success) {
          logger.info(result.message, job.id);
        } else {
          logger.error(result.message, job.id, result.error);
        }
      }

      logger.info(`Job ${job.name} completed successfully`, job.id);
      this.progressStream.completeConnection(
        job.id,
        connection.id,
        data.length
      );
      this.progressStream.completeJob(job.id, { rowsProcessed: data.length });
    } catch (error: any) {
      logger.error(`Job ${job.name} failed: ${error.message}`, job.id, error);
      this.progressStream.failConnection(job.id, connection.id, error.message);
      this.progressStream.failJob(job.id, error.message);
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

  /**
   * DEPRECATED - Now using DataBuffer for hybrid batching
   * Old method kept for reference only
   */
  // private async streamDataToDestinations() {}

  async testConnection(connection: SQLConnection): Promise<{
    success: boolean;
    message: string;
    activeServerType?: "static" | "vpn";
  }> {
    const connector = new SQLConnector();

    try {
      await connector.connect(connection);
      await connector.executeQuery("SELECT 1 AS test");

      // Get which server connected from the connector's internal config
      const activeServerType =
        (connector as any).config?.activeServerType || "static";

      const serverInfo =
        activeServerType === "vpn"
          ? `${connection.vpnServer}/${connection.database} (VPN fallback)`
          : `${connection.server}/${connection.database}`;

      return {
        success: true,
        message: `Connected successfully to ${serverInfo}`,
        activeServerType: activeServerType,
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
