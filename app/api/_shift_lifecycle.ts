// What happens to a shift and its workers when it finishes or is cancelled.
//
// Shift status
//   active     posted, not finished yet (workers can apply / be assigned / clock in)
//   completed  finished, and at least one assigned worker clocked in
//   incomplete finished, and nobody clocked in (no one assigned, or no-shows)
//   cancelled  called off by an admin: no applying, assigning or clocking in
//
// Each assigned worker's own result (approvedEmployee[].attendance)
//   completed  clocked in (and out). A worker who forgot to clock out is clocked out
//              automatically at the scheduled end (autoClockOut: true)
//   incomplete never clocked in
//
// Shifts close on their own 15 minutes after their scheduled end (the clock-out window),
// checked whenever shifts are read, or straight away when an admin marks one completed.
import { ShiftModel, attended, shiftEnd, shiftStart } from "./_shift";
import { closeShiftForWorkers, removeFromNextShifts } from "./_worker_shifts";
import { describeShiftTime, notifyWorker } from "./_notify";

export const GRACE_MS = 15 * 60 * 1000;

export const FINISHED_STATUSES = ["completed", "incomplete"] as const;

type Entry = {
  id?: string;
  userClockIn?: string;
  userClockOut?: string;
  userTotalWorkTime?: number;
  attendance?: "completed" | "incomplete";
  autoClockOut?: boolean;
};

// minutes inside the scheduled hours between clock-in and clock-out (same rule as clock-out)
export function countedMinutes(start: Date, end: Date, clockIn: Date, clockOut: Date) {
  const from = Math.max(clockIn.getTime(), start.getTime());
  const to = Math.min(clockOut.getTime(), end.getTime());
  return Math.max(0, Math.floor((to - from) / 60000));
}

// Set each assigned worker's result. `closeAt` is when anyone still clocked in gets clocked out:
// the scheduled end when the shift finished by itself, or now when an admin closes/cancels it early.
// Each write is conditional on the entry not having changed, so it can't overwrite a real clock-out
// that lands at the same moment.
async function settleWorkers(shift: any, closeAt: Date, cancelled: boolean) {
  const start = shiftStart(shift.shiftDate, shift.clockIn);
  const end = shiftEnd(shift);
  const approved: Entry[] = shift.approvedEmployee ?? [];
  const Shift = ShiftModel();

  for (const e of approved) {
    if (!e?.id) continue;
    let set: Record<string, unknown>;
    let match: Record<string, unknown>;

    if (e.userClockIn && !e.userClockOut) {
      // still clocked in: clock them out now / at the scheduled end
      const out = closeAt.getTime() < end.getTime() ? closeAt : end;
      const outAt = out.getTime() < new Date(e.userClockIn).getTime() ? new Date(e.userClockIn) : out;
      set = {
        "approvedEmployee.$.userClockOut": outAt.toISOString(),
        "approvedEmployee.$.userTotalWorkTime": countedMinutes(start, end, new Date(e.userClockIn), outAt),
        "approvedEmployee.$.autoClockOut": true,
        "approvedEmployee.$.attendance": "completed",
      };
      match = { id: e.id, userClockIn: { $exists: true }, userClockOut: { $exists: false } };
    } else if (e.userClockIn && e.userClockOut) {
      set = {
        "approvedEmployee.$.attendance": "completed",
        // older clock-outs were saved without a total: fill it in
        ...(e.userTotalWorkTime == null
          ? {
              "approvedEmployee.$.userTotalWorkTime": countedMinutes(
                start, end, new Date(e.userClockIn), new Date(e.userClockOut),
              ),
            }
          : {}),
      };
      match = { id: e.id, userClockOut: { $exists: true } };
    } else {
      // never clocked in. On a cancelled shift that's expected, so no result is recorded
      if (cancelled) continue;
      set = { "approvedEmployee.$.attendance": "incomplete" };
      match = { id: e.id, userClockIn: { $exists: false } };
    }

    await Shift.updateOne({ _id: shift._id, approvedEmployee: { $elemMatch: match } }, { $set: set });
  }

  const fresh: any = await Shift.findById(shift._id).lean();
  return (fresh?.approvedEmployee ?? []) as Entry[];
}

// Close a finished shift: record each worker's result, then mark the shift completed / incomplete.
// Returns the new status, or null if someone else closed it first.
export async function finishShift(shift: any, closeAt = new Date()) {
  const approved = await settleWorkers(shift, closeAt, false);
  const status = approved.some((e) => attended(e)) ? "completed" : "incomplete";
  const res = await ShiftModel().updateOne(
    { _id: shift._id, status: { $nin: ["cancelled", ...FINISHED_STATUSES] } },
    { $set: { status, finishedAt: new Date().toISOString() } },
  );
  if (res.modifiedCount === 0) return null; // already closed or cancelled elsewhere
  // workers who clocked in -> past shifts; no-shows -> off their upcoming list
  await closeShiftForWorkers(String(shift._id), approved as any);
  return status;
}

// Cancel: clock out anyone mid-shift, drop it from everyone's upcoming list, and tell the workers.
export async function cancelShift(shift: any) {
  const approved = await settleWorkers(shift, new Date(), true);
  await ShiftModel().updateOne({ _id: shift._id }, { $set: { status: "cancelled", cancelledAt: new Date().toISOString() } });

  const worked = approved.filter((e) => e?.id && e.userClockIn);
  const notWorked = approved.filter((e) => e?.id && !e.userClockIn).map((e) => e.id!);
  await closeShiftForWorkers(String(shift._id), worked as any);
  await removeFromNextShifts(notWorked, String(shift._id));

  // assigned workers and anyone still waiting on their application
  const applied: string[] = shift.appliedEmployee ?? [];
  const toTell = [...new Set([...approved.map((e) => e.id!).filter(Boolean), ...applied])];
  const where = [shift.client, shift.shiftLocation].filter(Boolean).join(", ");
  await Promise.all(
    toTell.map((uid) =>
      notifyWorker(uid, {
        title: "Shift cancelled",
        body: `${describeShiftTime(shift)}${where ? ` at ${where}` : ""} has been cancelled. You don't need to attend.`,
        data: { type: "shift_cancelled", shiftId: String(shift._id) },
      }),
    ),
  );
}

// Close every active shift whose clock-out window has passed. Cheap enough to run on each read;
// errors are logged so a failure here never stops shifts loading.
let running: Promise<void> | null = null;
export function finishEndedShifts() {
  running ??= (async () => {
    try {
      const now = Date.now();
      const today = new Date(now).toISOString().slice(0, 10);
      // a shift can't have ended if it starts after today (overnight shifts end the next day at most)
      const candidates: any[] = await ShiftModel().find({ status: "active", shiftDate: { $lte: today } }).lean();
      for (const s of candidates) {
        if (!s.shiftDate || !s.clockIn) continue;
        const end = shiftEnd(s);
        if (Number.isNaN(end.getTime()) || end.getTime() + GRACE_MS > now) continue;
        await finishShift(s, end);
      }
    } catch (error) {
      console.error("Error closing finished shifts:", error);
    } finally {
      running = null;
    }
  })();
  return running;
}
