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

  async send(
    data: any[],
    config: ExcelDestination,
    meta: JobMeta
  ): Promise<SendResult> {
    const { filePath, sheetName = "Sheet1", mode = "replace" } = config;

    try {
      // Auto-fix: If user provided a directory, add default filename
      let actualFilePath = filePath;

      // Check if path is a directory (exists and is directory, or doesn't end with .xlsx/.xls)
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        // It's a directory - add default filename
        actualFilePath = path.join(filePath, "export_" + Date.now() + ".xlsx");
        logger.info(`Directory provided, using filename: ${actualFilePath}`);
      } else if (!filePath.endsWith(".xlsx") && !filePath.endsWith(".xls")) {
        // Path doesn't end with excel extension - treat as directory and add filename
        actualFilePath = path.join(filePath, "export_" + Date.now() + ".xlsx");
        logger.info(
          `No .xlsx/.xls extension, treating as directory: ${actualFilePath}`
        );
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
}
