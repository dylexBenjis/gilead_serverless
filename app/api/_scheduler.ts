// Time-based jobs: close shifts whose clock-out window has passed and send shift reminders.
//
// Runs every minute inside the Next.js server (started from instrumentation.ts), which suits
// `next dev` / `next start` on a server that stays up. On a serverless host (e.g. Vercel), where
// nothing runs between requests, call GET /api/cron every minute with
// "Authorization: Bearer <CRON_SECRET>" instead, and set DISABLE_SHIFT_SCHEDULER=1.
import { connect_to_mongodb } from "./mongodb";
import { finishEndedShifts } from "./_shift_lifecycle";
import { sendShiftReminders } from "./_reminders";

let running: Promise<{ reminders: number }> | null = null;

// One pass. Overlapping calls share the pass already in progress.
export function runScheduledJobs() {
  running ??= (async () => {
    try {
      await connect_to_mongodb();
      await finishEndedShifts();
      const reminders = await sendShiftReminders();
      return { reminders };
    } catch (error) {
      console.error("Scheduled shift jobs failed:", error);
      return { reminders: 0 };
    } finally {
      running = null;
    }
  })();
  return running;
}

const TICK_MS = 60 * 1000;

export function startScheduler() {
  // one timer per server process, even when dev mode reloads modules
  const g = globalThis as { __gileadScheduler?: ReturnType<typeof setInterval> };
  if (g.__gileadScheduler) return;
  g.__gileadScheduler = setInterval(() => void runScheduledJobs(), TICK_MS);
  g.__gileadScheduler.unref?.();
  setTimeout(() => void runScheduledJobs(), 5000).unref?.(); // first pass shortly after start-up
  console.log("Shift scheduler started (closing ended shifts + reminders every minute)");
}
