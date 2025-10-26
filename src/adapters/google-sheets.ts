import { google } from "googleapis";
import * as fs from "fs";
import {
  DestinationAdapter,
  GoogleSheetsDestination,
  JobMeta,
  SendResult,
} from "../types";
import { logger } from "../core/logger";

export class GoogleSheetsAdapter implements DestinationAdapter {
  name = "google_sheets";

  // Multi-connection support: Create multiple sheets in one spreadsheet
  async sendMultiConnection(
    dataWithMeta: Array<{
      connection: any;
      data: any[];
      connectionFailedMessage?: string;
    }>,
    config: GoogleSheetsDestination,
    meta: { jobId: string; jobName: string; runTime: Date }
  ): Promise<SendResult> {
    try {
      // Parse credentials
      let credentials;
      if (config.credentialsJson) {
        credentials = JSON.parse(config.credentialsJson);
      } else if (config.credentialsPath) {
        credentials = JSON.parse(
          fs.readFileSync(config.credentialsPath, "utf-8")
        );
      } else {
        throw new Error(
          "No credentials provided. Please paste your Google Service Account JSON."
        );
      }

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });

      let totalRows = 0;

      // Create/update a sheet for each connection
      for (const {
        connection,
        data,
        connectionFailedMessage,
      } of dataWithMeta) {
        // Use only database name for sheet name
        let sheetName = connection.database || connection.name;

        // Truncate to 100 chars for Google Sheets limit
        sheetName = sheetName.substring(0, 100);

        let headers: string[];
        let values: any[][];

        if (connectionFailedMessage) {
          // For failed connections, create a simple structure with the error message
          headers = ["connectionName", "connectionFailedMessage", "data"];
          values = [[connection.name, connectionFailedMessage, "[]"]];
        } else {
          // Normal case
          headers = data.length > 0 ? Object.keys(data[0]) : [];
          values = data.map((row: any) =>
            headers.map((header) => row[header] ?? "")
          );
        }

        // Ensure sheet exists
        await this.ensureSheetExists(sheets, config.spreadsheetId, sheetName);

        // Write data based on mode
        switch (config.mode) {
          case "append":
            await this.appendData(
              sheets,
              { ...config, sheetName },
              headers,
              values,
              {
                jobId: meta.jobId,
                jobName: meta.jobName,
                runTime: meta.runTime,
                rowCount: values.length,
              } as JobMeta
            );
            break;
          case "replace":
            await this.replaceData(
              sheets,
              { ...config, sheetName },
              headers,
              values,
              {
                jobId: meta.jobId,
                jobName: meta.jobName,
                runTime: meta.runTime,
                rowCount: values.length,
              } as JobMeta
            );
            break;
          case "update":
            await this.updateData(sheets, { ...config, sheetName }, data, {
              jobId: meta.jobId,
              jobName: meta.jobName,
              runTime: meta.runTime,
              rowCount: values.length,
            } as JobMeta);
            break;
          default:
            throw new Error(`Unknown mode: ${config.mode}`);
        }

        totalRows += values.length;
      }

      // Build summary rows for this job run
      try {
        const summarySheetName = (config as any).summarySheetName || "Summary";

        // Ensure summary sheet exists
        await this.ensureSheetExists(
          sheets,
          config.spreadsheetId,
          summarySheetName
        );

        // Check if header exists
        const headerResp = await sheets.spreadsheets.values
          .get({
            spreadsheetId: config.spreadsheetId,
            range: `${summarySheetName}!1:1`,
          })
          .catch(() => ({ data: {} }));

        const headerData: any = headerResp && (headerResp as any).data;
        const hasHeader =
          headerData && headerData.values && headerData.values.length > 0;

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
          meta && meta.runTime
            ? new Date((meta as any).runTime).toISOString()
            : new Date().toISOString();

        const summaryValues = dataWithMeta.map((item) => {
          const conn = item.connection as any;
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

        if (summaryValues.length > 0) {
          const toAppend = hasHeader
            ? summaryValues
            : [summaryHeaders, ...summaryValues];

          await sheets.spreadsheets.values.append({
            spreadsheetId: config.spreadsheetId,
            range: `${summarySheetName}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: toAppend },
          });
        }
      } catch (err: any) {
        logger.warn(`Failed to write summary sheet: ${err?.message || err}`);
      }

      return {
        success: true,
        message: `Successfully created/updated ${dataWithMeta.length} sheets with ${totalRows} total rows in Google Sheets`,
      };
    } catch (error: any) {
      logger.error(
        "Google Sheets multi-connection operation failed",
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

  // Ensure a sheet exists in the spreadsheet
  private async ensureSheetExists(
    sheets: any,
    spreadsheetId: string,
    sheetName: string
  ): Promise<void> {
    try {
      // Get spreadsheet metadata
      const response = await sheets.spreadsheets.get({ spreadsheetId });
      const existingSheets = response.data.sheets || [];

      // Check if sheet exists
      const sheetExists = existingSheets.some(
        (sheet: any) => sheet.properties.title === sheetName
      );

      if (!sheetExists) {
        // Create new sheet
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                  },
                },
              },
            ],
          },
        });
        logger.info(`Created new sheet: ${sheetName}`);
      }
    } catch (error: any) {
      logger.error(`Failed to ensure sheet exists: ${error.message}`);
      throw error;
    }
  }

  async send(
    data: any[],
    config: GoogleSheetsDestination,
    meta: JobMeta
  ): Promise<SendResult> {
    try {
      // Parse credentials from JSON string (directly from textarea)
      let credentials;
      if (config.credentialsJson) {
        // New way: credentials stored as JSON string
        credentials = JSON.parse(config.credentialsJson);
      } else if (config.credentialsPath) {
        // Old way: credentials from file path (for backward compatibility)
        credentials = JSON.parse(
          fs.readFileSync(config.credentialsPath, "utf-8")
        );
      } else {
        throw new Error(
          "No credentials provided. Please paste your Google Service Account JSON."
        );
      }

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });

      // Convert data to 2D array format for Sheets API
      const headers = data.length > 0 ? Object.keys(data[0]) : [];
      const values = data.map((row) =>
        headers.map((header) => row[header] ?? "")
      );

      switch (config.mode) {
        case "append":
          await this.appendData(sheets, config, headers, values, meta);
          break;
        case "replace":
          await this.replaceData(sheets, config, headers, values, meta);
          break;
        case "update":
          await this.updateData(sheets, config, data, meta);
          break;
        default:
          throw new Error(`Unknown mode: ${config.mode}`);
      }

      return {
        success: true,
        message: `Successfully ${config.mode}d ${data.length} rows in Google Sheets`,
      };
    } catch (error: any) {
      logger.error("Google Sheets operation failed", meta.jobId, error.message);
      return {
        success: false,
        message: error.message,
        error,
      };
    }
  }

  private async appendData(
    sheets: any,
    config: GoogleSheetsDestination,
    headers: string[],
    values: any[][],
    meta: JobMeta
  ): Promise<void> {
    // Check if sheet is empty and add headers if needed
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheetName}!A1:ZZ1`,
    });

    if (!response.data.values || response.data.values.length === 0) {
      // Add headers first
      await sheets.spreadsheets.values.append({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    }

    // Append data
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheetName}!A:A`,
      valueInputOption: "RAW",
      requestBody: { values },
    });

    logger.info(`Appended ${values.length} rows to Google Sheets`, meta.jobId);
  }

  private async replaceData(
    sheets: any,
    config: GoogleSheetsDestination,
    headers: string[],
    values: any[][],
    meta: JobMeta
  ): Promise<void> {
    // Clear existing data
    await sheets.spreadsheets.values.clear({
      spreadsheetId: config.spreadsheetId,
      range: config.sheetName,
    });

    // Write headers and data
    const allValues = [headers, ...values];
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${config.sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: allValues },
    });

    logger.info(
      `Replaced data with ${values.length} rows in Google Sheets`,
      meta.jobId
    );
  }

  private async updateData(
    sheets: any,
    config: GoogleSheetsDestination,
    data: any[],
    meta: JobMeta
  ): Promise<void> {
    if (!config.keyColumn) {
      throw new Error("keyColumn is required for update mode");
    }

    // Read existing data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: config.sheetName,
    });

    const existingValues = response.data.values || [];
    if (existingValues.length === 0) {
      throw new Error("Sheet is empty. Use append or replace mode instead.");
    }

    const headers = existingValues[0];
    const keyIndex = headers.indexOf(config.keyColumn);

    if (keyIndex === -1) {
      throw new Error(`Key column '${config.keyColumn}' not found in sheet`);
    }

    // Build map of existing rows by key
    const existingMap = new Map<string, number>();
    for (let i = 1; i < existingValues.length; i++) {
      const key = existingValues[i][keyIndex];
      if (key) {
        existingMap.set(String(key), i);
      }
    }

    // Update matching rows
    let updatedCount = 0;
    for (const row of data) {
      const key = String(row[config.keyColumn]);
      const rowIndex = existingMap.get(key);

      if (rowIndex !== undefined) {
        const values = headers.map((header: string) => row[header] ?? "");
        await sheets.spreadsheets.values.update({
          spreadsheetId: config.spreadsheetId,
          range: `${config.sheetName}!A${rowIndex + 1}`,
          valueInputOption: "RAW",
          requestBody: { values: [values] },
        });
        updatedCount++;
      }
    }

    logger.info(`Updated ${updatedCount} rows in Google Sheets`, meta.jobId);
  }
}
