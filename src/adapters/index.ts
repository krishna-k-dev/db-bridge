import { DestinationAdapter } from "../types";
import { WebhookAdapter } from "./webhook";
import { GoogleSheetsAdapter } from "./google-sheets";
import { CustomAPIAdapter } from "./custom-api";
import { ExcelAdapter } from "./excel";
import { CSVAdapter } from "./csv";

// Registry of all available adapters
const adapters: Map<string, DestinationAdapter> = new Map();

// Register built-in adapters
adapters.set("webhook", new WebhookAdapter());
adapters.set("google_sheets", new GoogleSheetsAdapter());
adapters.set("custom_api", new CustomAPIAdapter());
adapters.set("excel", new ExcelAdapter());
adapters.set("csv", new CSVAdapter());

export function getAdapter(type: string): DestinationAdapter | undefined {
  return adapters.get(type);
}

export function registerAdapter(adapter: DestinationAdapter): void {
  adapters.set(adapter.name, adapter);
}

export function listAdapters(): string[] {
  return Array.from(adapters.keys());
}
