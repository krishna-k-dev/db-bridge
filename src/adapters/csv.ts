import * as fs from "fs";
import * as path from "path";
import { DestinationAdapter, JobMeta, SendResult } from "../types";
import { logger } from "../core/logger";

export interface CSVDestination {
  type: "csv";
  filePath: string;
  mode?: "append" | "replace"; // append: add to existing, replace: overwrite file
  delimiter?: string; // default: comma
  includeHeaders?: boolean; // default: true
}

export class CSVAdapter implements DestinationAdapter {
  name = "csv";

  private convertToCSV(
    data: any[],
    delimiter: string = ",",
    includeHeaders: boolean = true
  ): string {
    if (data.length === 0) return "";

    // Get headers from first object
    const headers = Object.keys(data[0]);

    // Escape function for CSV fields
    const escape = (value: any): string => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      // Escape if contains delimiter, quotes, or newlines
      if (str.includes(delimiter) || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV
    const lines: string[] = [];

    // Add headers
    if (includeHeaders) {
      lines.push(headers.map((h) => escape(h)).join(delimiter));
    }

    // Add data rows
    for (const row of data) {
      const values = headers.map((header) => escape(row[header]));
      lines.push(values.join(delimiter));
    }

    return lines.join("\n");
  }

  async send(
    data: any[],
    config: CSVDestination,
    meta: JobMeta
  ): Promise<SendResult> {
    let {
      filePath,
      mode = "replace",
      delimiter = ",",
      includeHeaders = true,
    } = config;

    // Replace placeholders in filePath
    filePath = filePath
      .replace(/{jobId}/g, meta.jobId)
      .replace(/{jobName}/g, meta.jobName)
      .replace(/{connectionId}/g, meta.connectionId || "unknown")
      .replace(/{connectionName}/g, meta.connectionName || "unknown")
      .replace(
        /{runTime}/g,
        meta.runTime.toISOString().slice(0, 19).replace(/:/g, "-")
      ); // YYYY-MM-DDTHH-MM-SS

    try {
      let actualFilePath = filePath;

      // Auto-fix: Add .csv extension if missing
      if (!actualFilePath.endsWith(".csv")) {
        // Check if it's a directory path
        if (
          fs.existsSync(actualFilePath) &&
          fs.statSync(actualFilePath).isDirectory()
        ) {
          // It's a directory - add filename using database name (from connectionName meta which now contains db name)
          actualFilePath = path.join(
            actualFilePath,
            `${meta.connectionName || "export"}_${Date.now()}.csv`
          );
          logger.info(`Directory provided, using filename: ${actualFilePath}`);
        } else {
          // It's a file path without extension - add .csv
          actualFilePath = actualFilePath + ".csv";
          logger.info(`No .csv extension, added: ${actualFilePath}`);
        }
      }

      // Ensure directory exists
      const dir = path.dirname(actualFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Update filePath for rest of function
      const finalFilePath = actualFilePath;

      let csvContent = this.convertToCSV(data, delimiter, includeHeaders);

      // Check if file exists and mode is append
      if (mode === "append" && fs.existsSync(finalFilePath)) {
        // Don't include headers if appending
        csvContent = this.convertToCSV(data, delimiter, false);
        fs.appendFileSync(finalFilePath, "\n" + csvContent, "utf8");
      } else {
        // Write new file (replace mode or file doesn't exist)
        fs.writeFileSync(finalFilePath, csvContent, "utf8");
      }

      logger.info(
        `CSV file ${
          mode === "append" ? "updated" : "created"
        }: ${finalFilePath} | ${data.length} rows`
      );

      return {
        success: true,
        message: `Wrote ${data.length} rows to ${finalFilePath}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("CSV adapter error: " + errorMessage);

      return {
        success: false,
        message: `Failed to write CSV file: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  async sendBatch(
    batches: any[][],
    config: CSVDestination,
    meta: JobMeta
  ): Promise<SendResult> {
    // For batch mode, concatenate all batches and write once
    const allData = batches.flat();
    return await this.send(allData, config, meta);
  }

  /**
   * Progressive write: Append single connection data immediately
   * Used for memory-efficient processing of large multi-connection jobs
   */
  async sendSingleConnectionProgressive(
    connection: any,
    data: any[],
    config: CSVDestination,
    meta: {
      jobId: string;
      jobName: string;
      runTime: Date;
      settings?: any;
      queryResults?: { [queryName: string]: any[] };
      connectionFailedMessage?: string;
    }
  ): Promise<SendResult> {
    let { filePath, delimiter = ",", includeHeaders = true } = config;

    // Replace placeholders
    filePath = filePath
      .replace(/{jobId}/g, meta.jobId)
      .replace(/{jobName}/g, meta.jobName)
      .replace(/{connectionId}/g, connection.id || "unknown")
      .replace(/{connectionName}/g, connection.name || connection.database || "unknown")
      .replace(
        /{runTime}/g,
        meta.runTime.toISOString().slice(0, 19).replace(/:/g, "-")
      );

    try {
      let actualFilePath = filePath;

      // Auto-fix: Add .csv extension if missing
      if (!actualFilePath.endsWith(".csv")) {
        if (
          fs.existsSync(actualFilePath) &&
          fs.statSync(actualFilePath).isDirectory()
        ) {
          actualFilePath = path.join(
            actualFilePath,
            `${meta.jobName}_${Date.now()}.csv`
          );
        } else {
          actualFilePath = actualFilePath + ".csv";
        }
      }

      // Ensure directory exists
      const dir = path.dirname(actualFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fileExists = fs.existsSync(actualFilePath);

      // Handle multi-query: Create separate files or sections
      if (meta.queryResults && Object.keys(meta.queryResults).length > 0) {
        for (const [queryName, queryData] of Object.entries(meta.queryResults)) {
          const queryFilePath = actualFilePath.replace(
            ".csv",
            `_${queryName}.csv`
          );
          const queryFileExists = fs.existsSync(queryFilePath);
          
          const csv = this.convertToCSV(
            queryData,
            delimiter,
            !queryFileExists // Only include headers if file doesn't exist
          );

          fs.appendFileSync(queryFilePath, csv + "\n", "utf8");
        }
      } else {
        // Single query mode - append to main file
        const csv = this.convertToCSV(
          data,
          delimiter,
          !fileExists // Only include headers if file doesn't exist
        );

        fs.appendFileSync(actualFilePath, csv + "\n", "utf8");
      }

      logger.info(
        `💾 Progressive CSV write: ${connection.name || connection.database} (${data.length} rows) appended to ${actualFilePath}`,
        meta.jobId
      );

      return {
        success: true,
        message: `Connection ${connection.name} data appended to CSV`,
      };
    } catch (error: any) {
      logger.error(
        `Failed to write CSV progressively for ${connection.name}: ${error.message}`,
        meta.jobId,
        error
      );
      return {
        success: false,
        message: `Failed to write CSV: ${error.message}`,
        error,
      };
    }
  }
}
