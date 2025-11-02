import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Card } from "@/components/ui/card";

export type ScheduleConfig =
  | {
      type: "once";
      hour: number; // 0-23
      minute: number; // 0-59
    }
  | {
      type: "repeated";
      mode: "every" | "hourlyAt";
      everyUnit?: "minutes" | "hours";
      everyValue?: number; // positive integer
      hourlyMinute?: number; // 0-59
      value?: string;
    };

interface AdvancedScheduleSelectorProps {
  value: ScheduleConfig;
  onChange: (config: ScheduleConfig) => void;
  className?: string;
}

// Generate a string representation used by the app/backend.
export function generateCron(config: ScheduleConfig): string {
  if (config.type === "once") {
    // Daily at specific time: minute hour * * * (runs every day at that time)
    const h = config.hour ?? 0;
    const m = config.minute ?? 0;
    return `${m} ${h} * * *`;
  }

  // repeated
  if (config.type === "repeated") {
    if (config.mode === "every") {
      const val = config.everyValue ?? 1;
      const unit = config.everyUnit ?? "minutes";
      if (unit === "minutes") return `*/${val} * * * *`;
      return `0 */${val} * * *`;
    }

    if (config.mode === "hourlyAt") {
      const hm = config.hourlyMinute ?? 0;
      return `${hm} * * * *`;
    }

    return config.value || "*/60 * * * *";
  }

  return "";
}

// Parse a cron/raw string into our ScheduleConfig shape. Supports daily and repeated patterns.
export function parseCronToConfig(cron: string): ScheduleConfig {
  if (!cron) return { type: "repeated", mode: "every", everyUnit: "hours", everyValue: 1 };

  const trimmed = cron.trim();

  // Legacy ONCE format support
  if (trimmed.startsWith("ONCE ")) {
    const time = trimmed.substring(5).trim();
    const [h, m] = time.split(":");
    return { type: "once", hour: parseInt(h || "0", 10), minute: parseInt(m || "0", 10) };
  }

  const parts = trimmed.split(" ");
  if (parts.length !== 5) return { type: "repeated", mode: "every", everyUnit: "hours", everyValue: 1, value: trimmed };

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Daily pattern: M H * * * (runs every day at specific time)
  if (!minute.includes("*") && !hour.includes("*") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return { type: "once", hour: parseInt(hour), minute: parseInt(minute) };
  }

  // interval minutes pattern: */N * * * *
  if (minute.startsWith("*/") && hour === "*") {
    const interval = parseInt(minute.substring(2)) || 1;
    return { type: "repeated", mode: "every", everyUnit: "minutes", everyValue: interval };
  }

  // every N hours pattern: 0 */N * * *
  if (minute === "0" && hour.startsWith("*/")) {
    const val = parseInt(hour.substring(2)) || 1;
    return { type: "repeated", mode: "every", everyUnit: "hours", everyValue: val };
  }

  // hourly at minute: M * * * *
  if (!minute.includes("*") && hour === "*") {
    return { type: "repeated", mode: "hourlyAt", hourlyMinute: parseInt(minute) };
  }

  // fallback - keep as repeated hourly every 1 hour but preserve raw cron
  return { type: "repeated", mode: "every", everyUnit: "hours", everyValue: 1, value: trimmed };
}

export function AdvancedScheduleSelector({ value, onChange, className }: AdvancedScheduleSelectorProps) {
  // initialize local state from value
  const [type, setType] = useState<ScheduleConfig["type"]>(value.type);

  // once
  const [onceHour, setOnceHour] = useState<number>(value.type === "once" ? value.hour : 2);
  const [onceMinute, setOnceMinute] = useState<number>(value.type === "once" ? value.minute : 0);

  // repeated
  const [mode, setMode] = useState<"every" | "hourlyAt">(value.type === "repeated" ? value.mode ?? "every" : "every");
  const [everyUnit, setEveryUnit] = useState<"minutes" | "hours">(value.type === "repeated" ? value.everyUnit ?? "hours" : "hours");
  const [everyValue, setEveryValue] = useState<number>(value.type === "repeated" ? value.everyValue ?? 1 : 1);
  const [hourlyMinute, setHourlyMinute] = useState<number>(value.type === "repeated" ? value.hourlyMinute ?? 0 : 0);

  // Sync local state when value prop changes (e.g., when loading from backend)
  useEffect(() => {
    setType(value.type);
    if (value.type === "once") {
      setOnceHour(value.hour);
      setOnceMinute(value.minute);
    } else {
      setMode(value.mode ?? "every");
      if (value.mode === "every") {
        setEveryUnit(value.everyUnit ?? "hours");
        setEveryValue(value.everyValue ?? 1);
      } else if (value.mode === "hourlyAt") {
        setHourlyMinute(value.hourlyMinute ?? 0);
      }
    }
  }, [value]);

  // Combobox options
  const hourOptions: ComboboxOption[] = Array.from({ length: 24 }, (_, i) => ({ value: i.toString(), label: `${i.toString().padStart(2, "0")}:00` }));
  const minuteOptions: ComboboxOption[] = Array.from({ length: 60 }, (_, i) => ({ value: i.toString(), label: `:${i.toString().padStart(2, "0")}` }));

  const intervalOptions: ComboboxOption[] = [
    { value: "5", label: "Every 5 minutes" },
    { value: "10", label: "Every 10 minutes" },
    { value: "15", label: "Every 15 minutes" },
    { value: "30", label: "Every 30 minutes" },
    { value: "60", label: "Every 1 hour" },
    { value: "120", label: "Every 2 hours" },
  ];

  // keep parent in sync
  useEffect(() => {
    if (type === "once") {
      onChange({ type: "once", hour: onceHour, minute: onceMinute });
      return;
    }

    // repeated
    if (mode === "every") {
      onChange({ type: "repeated", mode: "every", everyUnit, everyValue });
      return;
    }

    onChange({ type: "repeated", mode: "hourlyAt", hourlyMinute });
  }, [type, onceHour, onceMinute, mode, everyUnit, everyValue, hourlyMinute, onChange]);

  return (
    <div className={className}>
      <Card className="p-4">
        <div className="space-y-4">
          {/* Schedule Type Selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Schedule Type</Label>
            <Combobox
              options={[
                { value: "once", label: "Run Once Daily (every day at specific time)" },
                { value: "repeated", label: "Repeated (interval or hourly)" }
              ]}
              value={type}
              onValueChange={(val) => setType(val as ScheduleConfig["type"])}
              placeholder="Select schedule type"
            />
          </div>

          {/* Once Daily Fields */}
          {type === "once" && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <Label className="text-xs text-muted-foreground">Hour (0-23)</Label>
                <Combobox options={hourOptions} value={onceHour.toString()} onValueChange={(val) => setOnceHour(parseInt(val))} placeholder="Select hour" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Minute (0-59)</Label>
                <Combobox options={minuteOptions} value={onceMinute.toString()} onValueChange={(val) => setOnceMinute(parseInt(val))} placeholder="Select minute" />
              </div>
            </div>
          )}

          {/* Repeated Fields */}
          {type === "repeated" && (
            <div className="space-y-3 pt-2">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Repeat Mode</Label>
                <Combobox
                  options={[
                    { value: "every", label: "Every (interval)" },
                    { value: "hourlyAt", label: "Every hour at minute" }
                  ]}
                  value={mode}
                  onValueChange={(val) => setMode(val as "every" | "hourlyAt")}
                  placeholder="Select mode"
                />
              </div>

              {mode === "every" && (
                <div className="grid grid-cols-3 gap-3 items-end">
                  <div>
                    <Label className="text-xs text-muted-foreground">Interval</Label>
                    <Combobox options={intervalOptions} value={everyValue.toString()} onValueChange={(val) => setEveryValue(parseInt(val))} placeholder="Choose interval" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Unit</Label>
                    <Combobox options={[{ value: "minutes", label: "minutes" }, { value: "hours", label: "hours" }]} value={everyUnit} onValueChange={(val) => setEveryUnit(val as "minutes" | "hours")} placeholder="Unit" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Custom</Label>
                    <Input type="number" min={1} value={everyValue} onChange={(e) => setEveryValue(parseInt(e.target.value || "1"))} />
                  </div>
                </div>
              )}

              {mode === "hourlyAt" && (
                <div>
                  <Label className="text-xs text-muted-foreground">Minute</Label>
                  <Combobox options={minuteOptions} value={hourlyMinute.toString()} onValueChange={(val) => setHourlyMinute(parseInt(val))} placeholder="Minute" />
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="mt-4 p-3 bg-muted rounded-lg">
        <div className="text-sm">
          <span className="font-semibold">Current Schedule: </span>
          <code className="bg-background px-2 py-1 rounded">{generateCron(value)}</code>
        </div>
      </div>
    </div>
  );
}

