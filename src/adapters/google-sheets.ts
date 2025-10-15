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
