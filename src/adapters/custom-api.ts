import axios from "axios";
import {
  DestinationAdapter,
  CustomAPIDestination,
  JobMeta,
  SendResult,
} from "../types";
import { logger } from "../core/logger";

export class CustomAPIAdapter implements DestinationAdapter {
  name = "custom_api";

  // Multi-connection support: Send combined array with connection info
  async sendMultiConnection(
    dataWithMeta: Array<{
      connection: any;
      data: any[];
      connectionFailedMessage?: string;
    }>,
    config: CustomAPIDestination,
    meta: { jobId: string; jobName: string; runTime: Date; settings?: any }
  ): Promise<SendResult> {
    try {
      const method = config.method || "POST";

      // Get system users from settings
      const systemUsers = meta.settings?.systemUsers || [];

      // Combine all data into one array with connection name (MUST) and other metadata
      const combinedPayload = dataWithMeta.map(
        ({ connection, data, connectionFailedMessage }) => ({
          connectionName: connection.name, // Connection name
          connectionId: connection.id, // Connection ID
          database: connection.database, // Database name
          server: connection.server, // Server name
          financialYear: connection.financialYear || "", // Financial Year
          group: connection.group || "self", // Group (self/partner)
          partner:
            connection.group === "partner" ? connection.partner || "" : "", // Partner name if group is partner
          // Job metadata
          jobName: meta.jobName,
          jobGroup: (meta as any).jobGroup || "",
          rowCount: data.length, // Row count for this connection
          connectionFailedMessage: connectionFailedMessage || "", // Connection failed message
          // System Info - Users for WhatsApp notifications
          systemUsers: systemUsers.map((user: any) => ({
            name: user.name,
            number: user.number,
            group: user.group,
          })),
          data: data, // Actual data array
        })
      );

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
        `Custom API sent: ${totalRows} rows from ${dataWithMeta.length} connections`,
        meta.jobId
      );

      return {
        success: true,
        message: `Sent ${totalRows} rows from ${dataWithMeta.length} connections to ${config.url}`,
      };
    } catch (error: any) {
      logger.error(
        "Custom API multi-connection send failed",
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
    config: CustomAPIDestination,
    meta: JobMeta
  ): Promise<SendResult> {
    try {
      const method = config.method || "POST";
      const batchSize = config.batchSize || data.length;

      // Send in batches if needed
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);

        // Get system users from settings
        const systemUsers = (meta as any).settings?.systemUsers || [];

        await axios({
          method,
          url: config.url,
          data: {
            connectionName: meta.connectionName || "",
            connectionId: (meta as any).connectionId || "",
            database: (meta as any).database || "",
            server: (meta as any).server || "",
            financialYear: (meta as any).financialYear || "",
            group: (meta as any).group || "self",
            partner: (meta as any).partner || "",
            // Job metadata
            jobName: meta.jobName || "",
            jobGroup: (meta as any).jobGroup || "",
            rowCount: batch.length,
            connectionFailedMessage:
              (meta as any).connectionFailedMessage || "",
            // System Info - Users for WhatsApp notifications
            systemUsers: systemUsers.map((user: any) => ({
              name: user.name,
              number: user.number,
              group: user.group,
            })),
            data: batch,
            __v: 0,
          },
          headers: config.headers || {},
          timeout: 30000,
        });

        logger.info(
          `Custom API sent: ${batch.length} rows (batch ${
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
      logger.error("Custom API send failed", meta.jobId, error.message);
      return {
        success: false,
        message: error.message,
        error,
      };
    }
  }
}
