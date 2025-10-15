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
