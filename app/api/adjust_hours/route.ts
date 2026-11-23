// Admin corrects the hours a worker is paid for on a closed shift, with a note saying why
// (e.g. they worked but their phone died, or they left early without clocking out).
// 0 minutes marks them incomplete; anything more marks them completed. The worker is notified.
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { connect_to_mongodb } from "../mongodb";
import { corsJson as baseCorsJson, corsPreflight as baseCorsPreflight } from "../_cors";
import { requireAdminSession } from "../_auth";
import { auth0 } from "@/lib/auth0";
import { ShiftModel, attended } from "../_shift";
import { moveToPastShifts, removeFromPastShifts } from "../_worker_shifts";
import { describeShiftTime, notifyWorker } from "../_notify";

const METHODS = "POST, OPTIONS";
const corsJson = (request: Request, data: any, status = 200) => baseCorsJson(request, data, status, METHODS);

const bodySchema = z.object({
  shiftId: z.string(),
  workerId: z.string().min(1),
  minutes: z.number().int().min(0).max(24 * 60),
  note: z.string().trim().min(3, "Add a short note saying why").max(200),
});

const fmt = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

export async function OPTIONS(request: NextRequest) {
  return baseCorsPreflight(request, METHODS);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminSession(request, METHODS);
  if (denied) return denied;

  try {
    // read the session before the body: auth0 can't read a request whose body is consumed
    const session = await auth0.getSession(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return corsJson(request, { error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
    }
    const { shiftId, workerId, minutes, note } = parsed.data;
    if (!mongoose.isValidObjectId(shiftId)) return corsJson(request, { error: "Shift not found" }, 404);

    await connect_to_mongodb();
    const shift: any = await ShiftModel().findById(shiftId).lean();
    if (!shift) return corsJson(request, { error: "Shift not found" }, 404);
    if (shift.status === "active") {
      return corsJson(request, { error: "Hours can be adjusted once the shift has closed." }, 409);
    }
    const entry = (shift.approvedEmployee ?? []).find((e: any) => e?.id === workerId);
    if (!entry) return corsJson(request, { error: "This worker wasn't assigned to this shift" }, 404);

    const attendance = minutes > 0 ? "completed" : "incomplete";
    await ShiftModel().updateOne(
      { _id: shiftId, "approvedEmployee.id": workerId },
      {
        $set: {
          "approvedEmployee.$.userTotalWorkTime": minutes,
          "approvedEmployee.$.attendance": attendance,
          "approvedEmployee.$.adjusted": {
            minutes,
            previousMinutes: entry.userTotalWorkTime ?? null,
            note,
            by: session?.user?.email ?? session?.user?.name ?? "admin",
            at: new Date().toISOString(),
          },
        },
      },
    );

    // the shift's own result follows its workers' (a cancelled shift stays cancelled)
    const fresh: any = await ShiftModel().findById(shiftId).lean();
    if (fresh.status !== "cancelled") {
      const status = (fresh.approvedEmployee ?? []).some((e: any) => attended(e)) ? "completed" : "incomplete";
      if (status !== fresh.status) await ShiftModel().updateOne({ _id: shiftId }, { $set: { status } });
    }

    if (attendance === "completed") await moveToPastShifts(workerId, shiftId);
    else await removeFromPastShifts(workerId, shiftId);

    const where = [shift.client, shift.shiftLocation].filter(Boolean).join(", ");
    await notifyWorker(workerId, {
      title: "Your hours were updated",
      body: `${describeShiftTime(shift)}${where ? ` at ${where}` : ""}: ${minutes > 0 ? `now ${fmt(minutes)}` : "marked incomplete"}. ${note}`,
      data: { type: "hours_adjusted", shiftId },
    });

    return corsJson(request, { message: "Hours updated", minutes, attendance }, 200);
  } catch (error: any) {
    console.error("Error adjusting hours:", error);
    return corsJson(request, { error: "Failed to adjust hours", details: error?.message }, 400);
  }
}
