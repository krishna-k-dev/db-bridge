import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import { DestinationAdapter, JobMeta, SendResult } from "../types";
import { logger } from "../core/logger";

export interface ExcelDestination {
  type: "excel";
  filePath: string;
  sheetName?: string;
  mode?: "replace" | "append";
}

export class ExcelAdapter implements DestinationAdapter {
  name = "excel";

  async sendMultiConnection(
    dataWithMeta: Array<{
      connection: any;
      data: any[];
      queryResults?: { [queryName: string]: any[] }; // Multi-query support
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

      const workbook = new ExcelJS.Workbook();
      let existingFile = false;

      // Load existing file if it exists
      if (fs.existsSync(actualFilePath)) {
        existingFile = true;
        await workbook.xlsx.readFile(actualFilePath);
        logger.info(
          `[Excel Adapter] Existing file found with ${workbook.worksheets.length} sheets. Mode: ${mode}`,
          meta.jobId
        );
      } else {
        logger.info(
          `[Excel Adapter] Creating new workbook: ${actualFilePath}`,
          meta.jobId
        );
      }

      // Create sheets for each connection and query
      let totalRows = 0;
      const sheetsToUpdate = new Set<string>(); // Track which sheets we will touch

      // Collect all data with sheet names
      const sheetDataMap = new Map<string, any[]>();

      for (const {
        connection,
        data,
        queryResults,
        connectionFailedMessage,
      } of dataWithMeta) {
        const format = meta.settings?.sheetNameFormat || "databaseName";
        let baseSheetName = this.getSheetName(connection, format);

        // Handle multi-query: create separate sheets for each query
        if (queryResults && Object.keys(queryResults).length > 0) {
          for (const [queryName, queryData] of Object.entries(queryResults)) {
            const useQueryNameOnly =
              meta.settings?.multiQueryUseQueryNameOnly === true;
            let sheetName = useQueryNameOnly
              ? queryName
              : `${baseSheetName} - ${queryName}`;
            sheetName = this.sanitizeSheetName(sheetName);
            sheetsToUpdate.add(sheetName);

            let sheetData: any[];
            if (connectionFailedMessage) {
              sheetData = [
                {
                  connectionName: connection.name,
                  queryName: queryName,
                  connectionFailedMessage: connectionFailedMessage,
                  data: "[]",
                },
              ];
            } else {
              sheetData = queryData as any[];
            }

            sheetDataMap.set(sheetName, sheetData);
            totalRows += sheetData.length;
          }
        } else {
          // Legacy single query mode
          let sheetName = this.sanitizeSheetName(baseSheetName);
          sheetsToUpdate.add(sheetName);

          let sheetData: any[];
          if (connectionFailedMessage) {
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

          sheetDataMap.set(sheetName, sheetData);
          totalRows += sheetData.length;
        }
      }

      logger.info(
        `[Excel Adapter] Sheets to update: ${Array.from(sheetsToUpdate).join(', ')}`,
        meta.jobId
      );

      // Update ONLY the sheets in our update list
      for (const sheetName of sheetsToUpdate) {
        const sheetData = sheetDataMap.get(sheetName) || [];
        let worksheet = workbook.getWorksheet(sheetName);

        if (mode === "append" && worksheet) {
          // Append mode: Add to existing sheet data
          const existingRowCount = worksheet.rowCount;

          // Add new rows
          sheetData.forEach((row: any) => {
            worksheet!.addRow(row);
          });

          logger.info(
            `[Excel Adapter] Appending to sheet "${sheetName}": ${existingRowCount} + ${sheetData.length} = ${worksheet.rowCount} rows`,
            meta.jobId
          );
        } else {
          // Replace mode: Remove old sheet completely and create fresh
          if (worksheet) {
            // Remove the existing sheet to avoid any style/format interference
            workbook.removeWorksheet(worksheet.id);
            logger.info(
              `[Excel Adapter] Removed old sheet "${sheetName}" for replacement`,
              meta.jobId
            );
          }

          // Create fresh worksheet (no leftover styles/formats)
          worksheet = workbook.addWorksheet(sheetName);
          logger.info(
            `[Excel Adapter] Creating fresh sheet "${sheetName}" with ${sheetData.length} rows`,
            meta.jobId
          );

          // Add headers and data
          if (sheetData && sheetData.length > 0) {
            const headers = Object.keys(sheetData[0]);
            worksheet.columns = headers.map((h) => ({
              header: h,
              key: h,
              width: 15,
            }));

            // Add data rows
            sheetData.forEach((row: any) => {
              worksheet!.addRow(row);
            });
          }
        }
      }

      // Write file using ExcelJS (preserves formulas in untouched sheets automatically)
      await workbook.xlsx.writeFile(actualFilePath);

      logger.info(
        `[Excel Adapter] ✅ File written successfully: ${actualFilePath}`,
        meta.jobId
      );
      logger.info(
        `[Excel Adapter] Data sheets updated: ${sheetsToUpdate.size} | Total rows: ${totalRows}`,
        meta.jobId
      );

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

  async send(
    data: any[],
    config: ExcelDestination,
    meta: JobMeta
  ): Promise<SendResult> {
    let { filePath, sheetName = "Sheet1", mode = "replace" } = config;

    // Normalize slash direction
    filePath = filePath.replace(/\\/g, "/");

    // Replace placeholders in filePath
    filePath = filePath
      .replace(/{connectionName}/g, meta.connectionName || "unknown")
      .replace(/{jobId}/g, meta.jobId)
      .replace(/{jobName}/g, meta.jobName)
      .replace(
        /{runTime}/g,
        meta.runTime.toISOString().slice(0, 19).replace(/:/g, "-")
      )
      .replace(/{database}/g, (meta as any).database || "default")
      .replace(/{server}/g, (meta as any).server || "default")
      .replace(/{financialYear}/g, (meta as any).financialYear || "")
      .replace(/{group}/g, (meta as any).group || "")
      .replace(/{partner}/g, (meta as any).partner || "");

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

      const workbook = new ExcelJS.Workbook();
      let existingFile = false;

      // Check if file exists
      if (fs.existsSync(finalFilePath)) {
        existingFile = true;
        await workbook.xlsx.readFile(finalFilePath);

        logger.info(
          `[Excel Adapter] Existing file found. Updating only "${sheetName}"`,
          meta.jobId
        );

        // Get or create worksheet
        let worksheet = workbook.getWorksheet(sheetName);

        // Check mode
        if (mode === "append" && worksheet) {
          // Append mode: Add to existing sheet data
          const existingRowCount = worksheet.rowCount;

          // Add new rows
          data.forEach((row: any) => {
            worksheet!.addRow(row);
          });

          logger.info(
            `[Excel Adapter] Appending to sheet "${sheetName}": ${existingRowCount} + ${data.length} = ${worksheet.rowCount} rows`,
            meta.jobId
          );
        } else {
          // Replace mode: Remove old sheet and create fresh one
          if (worksheet) {
            // Remove existing sheet to avoid style/format carryover
            workbook.removeWorksheet(worksheet.id);
            logger.info(
              `[Excel Adapter] Removed old sheet "${sheetName}" for replacement`,
              meta.jobId
            );
          }

          // Create fresh worksheet
          worksheet = workbook.addWorksheet(sheetName);
          logger.info(
            `[Excel Adapter] Creating fresh sheet "${sheetName}" with ${data.length} rows`,
            meta.jobId
          );

          // Add headers and data
          if (data.length > 0) {
            const headers = Object.keys(data[0]);
            worksheet.columns = headers.map((h) => ({ header: h, key: h }));

            // Add data rows
            data.forEach((row: any) => {
              worksheet!.addRow(row);
            });
          }
        }
      } else {
        // Create new workbook (file doesn't exist)
        const worksheet = workbook.addWorksheet(sheetName);

        // Add headers and data
        if (data.length > 0) {
          const headers = Object.keys(data[0]);
          worksheet.columns = headers.map((h) => ({ header: h, key: h }));
          data.forEach((row: any) => {
            worksheet.addRow(row);
          });
        }

        logger.info(
          `[Excel Adapter] Creating new file with sheet "${sheetName}" (${data.length} rows)`,
          meta.jobId
        );
      }

      // Write file (ExcelJS preserves formulas in untouched sheets automatically)
      await workbook.xlsx.writeFile(finalFilePath);

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
      logger.error("Excel write error: " + errorMessage);

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

  // Helper method to get sheet name based on connection and format
  private getSheetName(
    connection: any,
    format: "connectionName" | "databaseName" | "databaseAndYear" | string
  ): string {
    switch (format) {
      case "connectionName":
        return connection.name || "Sheet1";

      case "databaseAndYear":
        return `${connection.database || "DB"} - ${
          connection.financialYear || "FY"
        }`;

      case "databaseName":
      default:
        return connection.database || connection.name || "Sheet1";
    }
  }
}
