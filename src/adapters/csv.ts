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
    const {
      filePath,
      mode = "replace",
      delimiter = ",",
      includeHeaders = true,
    } = config;

    try {
      // Auto-fix: If user provided a directory, add default filename
      let actualFilePath = filePath;

      // Check if path is a directory (exists and is directory, or doesn't end with .csv)
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        // It's a directory - add default filename
        actualFilePath = path.join(filePath, "export_" + Date.now() + ".csv");
        logger.info(`Directory provided, using filename: ${actualFilePath}`);
      } else if (!filePath.endsWith(".csv")) {
        // Path doesn't end with .csv - treat as directory and add filename
        actualFilePath = path.join(filePath, "export_" + Date.now() + ".csv");
        logger.info(
          `No .csv extension, treating as directory: ${actualFilePath}`
        );
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
}
