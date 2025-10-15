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

        await axios({
          method,
          url: config.url,
          data: batch, // Send raw batch data
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
