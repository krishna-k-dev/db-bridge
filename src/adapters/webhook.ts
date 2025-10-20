import axios from "axios";
import {
  DestinationAdapter,
  WebhookDestination,
  JobMeta,
  SendResult,
} from "../types";
import { logger } from "../core/logger";

export class WebhookAdapter implements DestinationAdapter {
  name = "webhook";

  // Multi-connection support: Send combined array with connection info
  async sendMultiConnection(
    dataWithMeta: Array<{ connection: any; data: any[] }>,
    config: WebhookDestination,
    meta: { jobId: string; jobName: string; runTime: Date }
  ): Promise<SendResult> {
    try {
      const method = config.method || "POST";

      // Combine all data into array format - each connection's data in array
      const combinedPayload = dataWithMeta.map(({ connection, data }) => ({
        connectionName: connection.name, // Connection name
        connectionId: connection.id, // Connection ID
        financialYear: connection.financialYear || "", // Financial Year
        group: connection.group || "self", // Group (self/partner)
        partner: connection.group === "partner" ? connection.partner || "" : "", // Partner name if group is partner
        rowCount: data.length, // Row count for this connection
        data: data, // Actual data array
      }));

      await axios({
        method,
        url: config.url,
        data: combinedPayload,
        headers: config.headers || {},
        timeout: 30000,
      });

      const totalRows = dataWithMeta.reduce(
        (sum, item) => sum + item.data.length,
        0
      );

      logger.info(
        `Webhook sent: ${totalRows} rows from ${dataWithMeta.length} connections`,
        meta.jobId
      );

      return {
        success: true,
        message: `Sent ${totalRows} rows from ${dataWithMeta.length} connections to ${config.url}`,
      };
    } catch (error: any) {
      logger.error(
        "Webhook multi-connection send failed",
        meta.jobId,
        error.message
      );
      return {
        success: false,
        message: error.message,
        error,
      };
    }
  }

  async send(
    data: any[],
    config: WebhookDestination,
    meta: JobMeta
  ): Promise<SendResult> {
    try {
      const method = config.method || "POST";
      const batchSize = config.batchSize || data.length;

      // Send in batches if needed
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);

        await axios({
          method,
          url: config.url,
          data: {
            jobId: meta.jobId,
            jobName: meta.jobName,
            connectionName: meta.connectionName || "",
            financialYear: (meta as any).financialYear || "",
            group: (meta as any).group || "self",
            partner: (meta as any).partner || "",
            timestamp: meta.runTime,
            rowCount: batch.length,
            data: batch,
          },
          headers: config.headers || {},
          timeout: 30000,
        });

        logger.info(
          `Webhook sent: ${batch.length} rows (batch ${
            Math.floor(i / batchSize) + 1
          })`,
          meta.jobId
        );
      }

      return {
        success: true,
        message: `Sent ${data.length} rows to ${config.url}`,
      };
    } catch (error: any) {
      logger.error("Webhook send failed", meta.jobId, error.message);
      return {
        success: false,
        message: error.message,
        error,
      };
    }
  }
}
