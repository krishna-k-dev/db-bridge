import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { DestinationAdapter, JobMeta, SendResult } from "../types";
import { logger } from "../core/logger";

export interface ExcelDestination {
  type: "excel";
  filePath: string;
  sheetName?: string;
  mode?: "append" | "replace"; // append: add to existing, replace: overwrite file
}

export class ExcelAdapter implements DestinationAdapter {
  name = "excel";

  // Multi-connection support: Create multiple sheets in one file
  async sendMultiConnection(
    dataWithMeta: Array<{
      connection: any;
      data: any[];
      connectionFailedMessage?: string;
    }>,
    config: ExcelDestination,
    meta: { jobId: string; jobName: string; runTime: Date; settings?: any }
  ): Promise<SendResult> {
    let { filePath, mode = "replace" } = config;

    // Replace placeholders in filePath (without connection-specific ones)
    filePath = filePath
      .replace(/{jobId}/g, meta.jobId)
      .replace(/{jobName}/g, meta.jobName)
      .replace(
        /{runTime}/g,
        meta.runTime.toISOString().slice(0, 19).replace(/:/g, "-")
      );

    try {
      let actualFilePath = filePath;

      // Auto-fix: Add .xlsx extension if missing
      if (
        !actualFilePath.endsWith(".xlsx") &&
        !actualFilePath.endsWith(".xls")
      ) {
        // Check if it's a directory path
        if (
          fs.existsSync(actualFilePath) &&
          fs.statSync(actualFilePath).isDirectory()
        ) {
          // It's a directory - add filename
          actualFilePath = path.join(
            actualFilePath,
            `${meta.jobName}_${Date.now()}.xlsx`
          );
        } else {
          // It's a file path without extension - add .xlsx
          actualFilePath = actualFilePath + ".xlsx";
        }
      }

      // Ensure directory exists
      const dir = path.dirname(actualFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let workbook: XLSX.WorkBook;

      // Handle mode
      if (mode === "append" && fs.existsSync(actualFilePath)) {
        // Append mode: Read existing file
        workbook = XLSX.readFile(actualFilePath);
      } else {
        // Replace mode: Create new workbook (overwrites old file)
        workbook = XLSX.utils.book_new();
      }

      // Create a sheet for each connection
      let totalRows = 0;
      for (const {
        connection,
        data,
        connectionFailedMessage,
      } of dataWithMeta) {
        // Determine sheet name based on settings
        const format = meta.settings?.sheetNameFormat || "databaseName";
        logger.info(
          `[Excel Adapter] Sheet name format: ${format}`,
          meta.jobId,
          {
            format,
            hasSettings: !!meta.settings,
            sheetNameFormat: meta.settings?.sheetNameFormat,
            connectionName: connection.name,
            connectionDatabase: connection.database,
            connectionStore: connection.store,
          }
        );
        let sheetName = this.getSheetName(connection, format);
        logger.info(
          `[Excel Adapter] Generated sheet name: ${sheetName}`,
          meta.jobId
        );
        sheetName = this.sanitizeSheetName(sheetName);

        let sheetData: any[];

        if (connectionFailedMessage) {
          // For failed connections, create a row with error message
          sheetData = [
            {
              connectionName: connection.name,
              connectionFailedMessage: connectionFailedMessage,
              data: "[]",
            },
          ];
        } else {
          sheetData = data;
        }

        // In append mode, merge with existing sheet if it exists
        if (mode === "append" && workbook.SheetNames.includes(sheetName)) {
          const existingSheet = workbook.Sheets[sheetName];
          const existingData = XLSX.utils.sheet_to_json(existingSheet);
          const mergedData = [...existingData, ...sheetData];

          // Remove old sheet and add merged one
          delete workbook.Sheets[sheetName];
          const newIndex = workbook.SheetNames.indexOf(sheetName);
          if (newIndex > -1) {
            workbook.SheetNames.splice(newIndex, 1);
          }

          const worksheet = XLSX.utils.json_to_sheet(mergedData);
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        } else {
          // Create new sheet (replace mode or sheet doesn't exist)
          const worksheet = XLSX.utils.json_to_sheet(sheetData);

          // If sheet already exists in workbook, remove it first
          if (workbook.SheetNames.includes(sheetName)) {
            delete workbook.Sheets[sheetName];
            const idx = workbook.SheetNames.indexOf(sheetName);
            if (idx > -1) {
              workbook.SheetNames.splice(idx, 1);
            }
          }

          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }

        totalRows += sheetData.length;
      }

      // Write file
      XLSX.writeFile(workbook, actualFilePath);

      logger.info(
        `Excel file created with ${dataWithMeta.length} sheets: ${actualFilePath} | ${totalRows} total rows`
      );

      // Build summary sheet
      try {
        const summarySheetName = (config as any).summarySheetName || "Summary";
        const summaryHeaders = [
          "timestamp",
          "connectionName",
          "server",
          "database",
          "financialYear",
          "group",
          "partner",
          "status",
          "rows",
        ];

        const runTimeIso =
          meta && (meta as any).runTime
            ? new Date((meta as any).runTime).toISOString()
            : new Date().toISOString();

        const summaryRows = dataWithMeta.map((item) => {
          const conn: any = item.connection;
          const status = item.connectionFailedMessage
            ? `FAILED: ${item.connectionFailedMessage}`
            : `SUCCESS: ${item.data.length} rows`;

          return [
            runTimeIso,
            conn.name || "",
            conn.server || "",
            conn.database || "",
            conn.financialYear || "",
            conn.group || "",
            conn.partner || "",
            status,
            item.data.length || 0,
          ];
        });

        // Create or replace summary sheet
        const summarySheet = XLSX.utils.json_to_sheet([
          // Convert rows to objects matching headers for easy appending
          ...summaryRows.map((r) => {
            const obj: any = {};
            summaryHeaders.forEach((h, i) => (obj[h] = r[i]));
            return obj;
          }),
        ]);

        // Remove existing summary sheet if present
        if (workbook.SheetNames.includes(summarySheetName)) {
          delete workbook.Sheets[summarySheetName];
          const idx = workbook.SheetNames.indexOf(summarySheetName);
          if (idx > -1) workbook.SheetNames.splice(idx, 1);
        }

        XLSX.utils.book_append_sheet(workbook, summarySheet, summarySheetName);

        // Write file again with summary sheet
        XLSX.writeFile(workbook, actualFilePath);
      } catch (err: any) {
        logger.warn(
          `Failed to write Excel summary sheet: ${err?.message || err}`
        );
      }

      return {
        success: true,
        message: `Created Excel with ${dataWithMeta.length} sheets (${totalRows} rows) in ${actualFilePath}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Excel multi-connection error: " + errorMessage);

      return {
        success: false,
        message: `Failed to write Excel file: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  // Sanitize sheet name (max 31 chars, no special chars)
  private sanitizeSheetName(name: string): string {
    return name.replace(/[:\\\/\?\*\[\]]/g, "_").substring(0, 31);
  }

  async send(
    data: any[],
    config: ExcelDestination,
    meta: JobMeta
  ): Promise<SendResult> {
    let { filePath, sheetName = "Sheet1", mode = "replace" } = config;

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

      // Auto-fix: Add .xlsx extension if missing
      if (
        !actualFilePath.endsWith(".xlsx") &&
        !actualFilePath.endsWith(".xls")
      ) {
        // Check if it's a directory path
        if (
          fs.existsSync(actualFilePath) &&
          fs.statSync(actualFilePath).isDirectory()
        ) {
          // It's a directory - add filename
          actualFilePath = path.join(
            actualFilePath,
            `${meta.connectionName || "export"}_${Date.now()}.xlsx`
          );
          logger.info(`Directory provided, using filename: ${actualFilePath}`);
        } else {
          // It's a file path without extension - add .xlsx
          actualFilePath = actualFilePath + ".xlsx";
          logger.info(`No .xlsx extension, added: ${actualFilePath}`);
        }
      }

      // Ensure directory exists
      const dir = path.dirname(actualFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Update filePath for rest of function
      const finalFilePath = actualFilePath;

      let workbook: XLSX.WorkBook;
      let worksheet: XLSX.WorkSheet;

      // Check if file exists and mode is append
      if (mode === "append" && fs.existsSync(finalFilePath)) {
        // Read existing workbook
        workbook = XLSX.readFile(finalFilePath);

        // Get or create sheet
        if (workbook.SheetNames.includes(sheetName)) {
          worksheet = workbook.Sheets[sheetName];

          // Convert existing sheet to JSON
          const existingData = XLSX.utils.sheet_to_json(worksheet);

          // Merge with new data
          const mergedData = [...existingData, ...data];

          // Convert back to worksheet
          worksheet = XLSX.utils.json_to_sheet(mergedData);
        } else {
          // Create new sheet with data
          worksheet = XLSX.utils.json_to_sheet(data);
          workbook.SheetNames.push(sheetName);
        }

        workbook.Sheets[sheetName] = worksheet;
      } else {
        // Create new workbook (replace mode or file doesn't exist)
        worksheet = XLSX.utils.json_to_sheet(data);
        workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      // Write file
      XLSX.writeFile(workbook, finalFilePath);

      logger.info(
        `Excel file ${
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
      logger.error("Excel adapter error: " + errorMessage);

      return {
        success: false,
        message: `Failed to write Excel file: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  async sendBatch(
    batches: any[][],
    config: ExcelDestination,
    meta: JobMeta
  ): Promise<SendResult> {
    // For batch mode, concatenate all batches and write once
    const allData = batches.flat();
    return await this.send(allData, config, meta);
  }

  private getSheetName(
    connection: any,
    format: "connectionName" | "databaseName" | "storeName"
  ): string {
    switch (format) {
      case "connectionName":
        return connection.name || connection.database || "Sheet";
      case "storeName":
        return (
          connection.store || connection.database || connection.name || "Sheet"
        );
      case "databaseName":
      default:
        return connection.database || connection.name || "Sheet";
    }
  }
}
