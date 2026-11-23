// Runs once when the Next.js server starts. Starts the every-minute shift jobs (closing ended
// shifts, reminders) on the Node.js server. Set DISABLE_SHIFT_SCHEDULER=1 where /api/cron is
// called by an external scheduler instead (see app/api/_scheduler.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_SHIFT_SCHEDULER === "1") return;
  const { startScheduler } = await import("./app/api/_scheduler");
  startScheduler();
}
