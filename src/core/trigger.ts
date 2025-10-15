import * as crypto from "crypto";
import { Job } from "../types";

export function shouldTrigger(job: Job, currentData: any[]): boolean {
  if (job.trigger === "always") {
    return true;
  }

  if (job.trigger === "onChange") {
    const currentHash = hashData(currentData);

    if (!job.lastHash) {
      // First run, always trigger and save hash
      job.lastHash = currentHash;
      return true;
    }

    if (currentHash !== job.lastHash) {
      // Data changed
      job.lastHash = currentHash;
      return true;
    }

    // Data unchanged
    return false;
  }

  return false;
}

function hashData(data: any[]): string {
  const jsonString = JSON.stringify(data);
  return crypto.createHash("sha256").update(jsonString).digest("hex");
}
