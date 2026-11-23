// Runs the time-based shift jobs (close ended shifts, send reminders) when called by an external
// scheduler. Only for hosts where the built-in every-minute timer can't run (see _scheduler.ts).
// Requires CRON_SECRET in the environment and "Authorization: Bearer <CRON_SECRET>".
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runScheduledJobs } from "../_scheduler";

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured: closed
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runScheduledJobs();
  return NextResponse.json({ ok: true, ...result });
}
