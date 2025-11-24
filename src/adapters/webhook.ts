import axios from "axios";
import {
  DestinationAdapter,
  WebhookDestination,
  JobMeta,
  SendResult,
  Store,
} from "../types";
import { logger } from "../core/logger";

// Helper: stable stringify for objects to generate a deterministic key
function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${entries.join(",")}}`;
}

// Helper: de-duplicate rows within a single job run
function dedupeRows<T = any>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows || []) {
    const key = stableStringify(r);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

// Helper: resolve store info (short name -> full name) from settings
function resolveStoreInfo(connection: any, settings?: { stores?: Store[] }) {
  const storeShortName = connection?.store || "";
  let storeName = "";
  if (storeShortName && settings?.stores && Array.isArray(settings.stores)) {
    const match = settings.stores.find(
      (s) => s.shortName?.toLowerCase() === String(storeShortName).toLowerCase()
    );
    storeName = match?.name || "";
  }
  return { storeShortName, storeName };
}

export class WebhookAdapter implements DestinationAdapter {
  name = "webhook";

  // Multi-connection support: Send combined array with connection info
  async sendMultiConnection(
    dataWithMeta: Array<{
      connection: any;
      data: any[];
      connectionFailedMessage?: string;
    }>,
    config: WebhookDestination,
    meta: { jobId: string; jobName: string; runTime: Date; settings?: any }
  ): Promise<SendResult> {
    try {
      const method = config.method || "POST";

      // Get system users from settings
      const systemUsers = meta.settings?.systemUsers || [];

      // Combine all data into array format - each connection's data in array
      const combinedPayload = dataWithMeta.map(
        ({ connection, data, connectionFailedMessage }) => {
          const deduped = dedupeRows(data);
          const { storeShortName, storeName } = resolveStoreInfo(
            connection,
            meta.settings
          );
          return {
            connectionName: connection.name, // Connection name
            connectionId: connection.id, // Connection ID
            financialYear: connection.financialYear || "", // Financial Year
            group: connection.group || "self", // Group (self/partner)
            partner:
              connection.group === "partner" ? connection.partner || "" : "", // Partner name if group is partner
            storeShortName,
            storeName,
            // Job metadata will be attached by executor in meta param
            jobName: meta.jobName,
            jobGroup: (meta as any).jobGroup || "",
            rowCount: deduped.length, // Row count for this connection
            connectionFailedMessage: connectionFailedMessage || "", // Connection failed message
            // System Info - Users for WhatsApp notifications
            systemUsers: systemUsers.map((user: any) => ({
              name: user.name,
              number: user.number,
              group: user.group,
            })),
            data: deduped, // Actual data array
          };
        }
      );

      await axios({
        method,
        url: config.url,
        data: combinedPayload,
        headers: config.headers || {},
        timeout: 30000,
      });

      const totalRows = combinedPayload.reduce((sum, item: any) => sum + (item.rowCount || 0), 0);

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
      // De-duplicate entire data set once per send call
      const dedupedData = dedupeRows(data);
      const batchSize = config.batchSize || dedupedData.length;

      // Send in batches if needed
      for (let i = 0; i < dedupedData.length; i += batchSize) {
        const batch = dedupedData.slice(i, i + batchSize);

        // Get system users from settings
        const systemUsers = (meta as any).settings?.systemUsers || [];
        const { storeShortName, storeName } = resolveStoreInfo(
          (meta as any),
          (meta as any).settings
        );

        await axios({
          method,
          url: config.url,
          data: {
            // Connection-level metadata
            connectionName: meta.connectionName || "",
            connectionId: (meta as any).connectionId || "",
            database: (meta as any).database || "",
            server: (meta as any).server || "",
            financialYear: (meta as any).financialYear || "",
            group: (meta as any).group || "self",
            partner: (meta as any).partner || "",
            storeShortName,
            storeName,
            // Job-level metadata
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
          `Webhook sent: ${batch.length} rows (batch ${
            Math.floor(i / batchSize) + 1
          })`,
          meta.jobId
        );
      }

      return {
        success: true,
        message: `Sent ${dedupedData.length} rows to ${config.url}`,
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
