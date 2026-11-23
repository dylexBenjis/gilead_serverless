// Push reminders for assigned workers:
//   - about an hour before the shift starts (if they haven't clocked in)
//   - 10 minutes before the end if they're still clocked in, so they remember to clock out
// Each reminder is sent once per worker per shift: the "sent" flag is claimed in the same write
// that checks it, so two servers (or two ticks) can't both send it.
import { ShiftModel, shiftEnd, shiftStart } from "./_shift";
import { notifyWorker } from "./_notify";
import { GRACE_MS } from "./_shift_lifecycle";

const START_LEAD_MS = 60 * 60 * 1000; // first reminder: 1 hour before
const END_LEAD_MS = 10 * 60 * 1000; // clock-out reminder: 10 minutes before the end

const hhmm = (d: Date) =>
  d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: process.env.SHIFT_TIMEZONE || "Europe/London" });

// claim a reminder flag for one worker; true if this call claimed it (so should send)
async function claim(shiftId: unknown, uid: string, flag: "reminderStartSent" | "reminderEndSent") {
  const res = await ShiftModel().updateOne(
    { _id: shiftId, approvedEmployee: { $elemMatch: { id: uid, [flag]: { $exists: false } } } },
    { $set: { [`approvedEmployee.$.${flag}`]: new Date().toISOString() } },
  );
  return res.modifiedCount === 1;
}

export async function sendShiftReminders(now = Date.now()) {
  const day = (offset: number) => new Date(now + offset * 86400000).toISOString().slice(0, 10);
  const shifts: any[] = await ShiftModel()
    .find({ status: "active", shiftDate: { $gte: day(-1), $lte: day(1) } })
    .lean();

  let sent = 0;
  for (const s of shifts) {
    if (!s.shiftDate || !s.clockIn) continue;
    const start = shiftStart(s.shiftDate, s.clockIn);
    const end = shiftEnd(s);
    const where = [s.client, s.shiftLocation].filter(Boolean).join(", ");

    for (const e of (s.approvedEmployee ?? []) as any[]) {
      if (!e?.id) continue;

      // starting soon (not once it's well under way: a late reminder is just noise)
      const untilStart = start.getTime() - now;
      if (!e.userClockIn && !e.reminderStartSent && untilStart <= START_LEAD_MS && untilStart > -5 * 60 * 1000) {
        if (await claim(s._id, e.id, "reminderStartSent")) {
          await notifyWorker(e.id, {
            title: `Shift starts at ${hhmm(start)}`,
            body: `${where || "Your shift"}. Clock in when you arrive (from ${hhmm(new Date(start.getTime() - GRACE_MS))}).`,
            data: { type: "shift_reminder_start", shiftId: String(s._id) },
          });
          sent++;
        }
      }

      // still clocked in near the end
      const untilEnd = end.getTime() - now;
      if (e.userClockIn && !e.userClockOut && !e.reminderEndSent && untilEnd <= END_LEAD_MS && untilEnd > -GRACE_MS) {
        if (await claim(s._id, e.id, "reminderEndSent")) {
          await notifyWorker(e.id, {
            title: "Don't forget to clock out",
            body: `Your shift${where ? ` at ${where}` : ""} ends at ${hhmm(end)}. Clock out in the app before ${hhmm(new Date(end.getTime() + GRACE_MS))}.`,
            data: { type: "shift_reminder_end", shiftId: String(s._id) },
          });
          sent++;
        }
      }
    }
  }
  return sent;
}
