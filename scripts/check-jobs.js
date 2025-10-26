const fs = require("fs");
const path = require("path");
const cron = require("node-cron");

const configPath = path.join(__dirname, "..", "config", "config.json");
if (!fs.existsSync(configPath)) {
  console.error("Config file not found at", configPath);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const jobs = config.jobs || [];

console.log("Found", jobs.length, "jobs in config");
console.log("---");

jobs.forEach((job) => {
  const id = job.id || "(no id)";
  const name = job.name || "(no name)";
  const enabled = !!job.enabled;
  const schedule = job.schedule;
  const recurrenceType = job.recurrenceType;
  const timeOfDay = job.timeOfDay;
  const everyNDays = job.everyNDays;

  const cronValid = typeof schedule === "string" && cron.validate(schedule);
  let timeValid = false;
  if (timeOfDay && typeof timeOfDay === "string") {
    const parts = timeOfDay.split(":").map(Number);
    timeValid = parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]);
  }

  // Decide what scheduler will likely do based on current logic
  let willSchedule = false;
  let reason = "";

  if (!enabled) {
    reason = "disabled";
  } else if (schedule === "manual") {
    reason = "manual schedule";
  } else if (recurrenceType) {
    if (recurrenceType === "daily") {
      if (timeValid) {
        willSchedule = true;
        reason = `daily at ${timeOfDay}`;
      } else if (cronValid) {
        willSchedule = true;
        reason = `daily but falling back to cron ${schedule}`;
      } else {
        reason = "recurrenceType=daily but missing valid timeOfDay/cron";
      }
    } else if (recurrenceType === "every-n-days") {
      if (everyNDays && timeValid) {
        willSchedule = true;
        reason = `every ${everyNDays} days at ${timeOfDay}`;
      } else if (cronValid) {
        willSchedule = true;
        reason = `every-n-days but falling back to cron ${schedule}`;
      } else {
        reason =
          "recurrenceType=every-n-days but missing everyNDays/timeOfDay/cron";
      }
    } else if (recurrenceType === "once") {
      reason = "once/manual";
    } else if (recurrenceType === "custom") {
      if (cronValid) {
        willSchedule = true;
        reason = `custom cron ${schedule}`;
      } else {
        reason = "recurrenceType=custom but invalid cron";
      }
    } else {
      // unknown recurrenceType - try cron
      if (cronValid) {
        willSchedule = true;
        reason = `unknown recurrenceType '${recurrenceType}' but using cron ${schedule}`;
      } else {
        reason = `unknown recurrenceType '${recurrenceType}' and invalid/no cron`;
      }
    }
  } else {
    // no recurrenceType - legacy: if timeOfDay exists it's daily, else accept cron
    if (timeValid) {
      willSchedule = true;
      reason = `legacy daily at ${timeOfDay}`;
    } else if (cronValid) {
      willSchedule = true;
      reason = `legacy cron ${schedule}`;
    } else {
      reason = "no recurrenceType and no valid timeOfDay/cron";
    }
  }

  console.log(`Job: ${name} (${id})`);
  console.log(`  enabled: ${enabled}`);
  console.log(`  schedule: ${schedule}`);
  console.log(`  recurrenceType: ${recurrenceType}`);
  console.log(`  timeOfDay: ${timeOfDay}`);
  console.log(`  everyNDays: ${everyNDays}`);
  console.log(`  cronValid: ${cronValid}`);
  console.log(`  timeValid: ${timeValid}`);
  console.log(`  -> willSchedule: ${willSchedule} (${reason})`);
  console.log("---");
});
