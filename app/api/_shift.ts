import mongoose from "mongoose";

export const ShiftModel = () =>
  mongoose.models.Shift || mongoose.model("Shift", new mongoose.Schema({}, { strict: false }));

// shiftDate + clockIn ("YYYY-MM-DD" + "HH:MM") are wall-clock times with no timezone attached,
// so they're read in this timezone rather than whatever timezone the server happens to run in
export const SHIFT_TIMEZONE = process.env.SHIFT_TIMEZONE || "Europe/London";

// how far `timeZone` is ahead of UTC at the instant `at`, in ms
function timeZoneOffsetMs(at: Date, timeZone: string) {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at)) {
    parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

export function shiftStart(shiftDate: string, clockIn: string) {
  const time = clockIn.length === 5 ? `${clockIn}:00` : clockIn;
  const asIfUtc = new Date(`${shiftDate}T${time}Z`);
  return new Date(asIfUtc.getTime() - timeZoneOffsetMs(asIfUtc, SHIFT_TIMEZONE));
}

export function shiftEnd(shift: { shiftDate: string; clockIn: string; regularHours?: number }) {
  return new Date(shiftStart(shift.shiftDate, shift.clockIn).getTime() + (shift.regularHours ?? 0) * 60 * 60 * 1000);
}

// Mongo stores the primary key as `_id`; the rest of the app (and the Zod
// schema) works with a plain string `id`, so normalize every document that
// leaves the API.
export function normalize(doc: any) {
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

// What a worker is allowed to see of a shift: their own application/assignment
// only, plus a count of filled spots — never other workers' IDs or clock times.
export function forWorker(shift: any, uid: string) {
  const { userId, appliedEmployee = [], approvedEmployee = [], ...rest } = shift;
  return {
    ...rest,
    appliedEmployee: appliedEmployee.includes(uid) ? [uid] : [],
    approvedEmployee: approvedEmployee.filter((e: any) => e?.id === uid),
    approvedCount: approvedEmployee.length,
  };
}

// Did this worker actually work it? Clocked in, or hours added by an admin. An admin can also
// set someone to incomplete (0 hours), which wins over a clock-in.
export function attended(e: { userClockIn?: string; attendance?: string } | undefined) {
  if (!e) return false;
  if (e.attendance) return e.attendance === "completed";
  return !!e.userClockIn;
}

// "YYYY-MM-DD" n days from `date`
function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Another active shift this worker is assigned to whose hours overlap `shift`, if any.
// (Shifts are at most 24h, so only the day before / same day / day after can overlap.)
export async function findClash(uid: string, shift: { _id?: unknown; id?: string; shiftDate: string; clockIn: string; regularHours?: number }) {
  const ownId = String(shift._id ?? shift.id ?? "");
  const others: any[] = await ShiftModel()
    .find({
      status: "active",
      "approvedEmployee.id": uid,
      shiftDate: { $gte: addDays(shift.shiftDate, -1), $lte: addDays(shift.shiftDate, 1) },
    })
    .lean();
  const start = shiftStart(shift.shiftDate, shift.clockIn).getTime();
  const end = shiftEnd(shift).getTime();
  return (
    others.find((o) => {
      if (String(o._id) === ownId || !o.shiftDate || !o.clockIn) return false;
      return shiftStart(o.shiftDate, o.clockIn).getTime() < end && start < shiftEnd(o).getTime();
    }) ?? null
  );
}

// "Acme on 2026-11-20, 09:00–17:00"
export function describeClash(o: any) {
  return `${o.client || o.shiftLocation || "another shift"} on ${o.shiftDate}, ${o.clockIn}–${o.clockOut}`;
}
