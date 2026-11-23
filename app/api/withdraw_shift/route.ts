// A signed-in worker withdraws from a shift.
//   - an application that hasn't been accepted yet can be withdrawn any time before the shift starts
//   - once assigned, only up to WITHDRAW_CUTOFF_HOURS before the start; after that they call Gilead
// Each withdrawal is recorded on the shift (withdrawals[]) so the admin can see who dropped out.
import mongoose from "mongoose";
import { connect_to_mongodb } from "../mongodb";
import { corsJson as baseCorsJson, corsPreflight as baseCorsPreflight } from "../_cors";
import { requireWorker } from "../_auth";
import { ShiftModel, shiftStart } from "../_shift";
import { removeFromNextShifts } from "../_worker_shifts";

const METHODS = "POST, OPTIONS";
const corsJson = (request: Request, data: any, status = 200) => baseCorsJson(request, data, status, METHODS);

const WITHDRAW_CUTOFF_HOURS = 24;

export async function OPTIONS(request: Request) {
  return baseCorsPreflight(request, METHODS);
}

export async function POST(request: Request) {
  const worker = await requireWorker(request);
  if (worker.denied) return worker.denied;
  const uid = worker.uid;

  try {
    const { shiftId } = await request.json().catch(() => ({}));
    if (!shiftId || typeof shiftId !== "string" || !mongoose.isValidObjectId(shiftId)) {
      return corsJson(request, { error: "Shift not found" }, 404);
    }

    await connect_to_mongodb();
    const shift: any = await ShiftModel().findById(shiftId).lean();
    if (!shift) return corsJson(request, { error: "Shift not found" }, 404);

    const applied: string[] = shift.appliedEmployee ?? [];
    const entry = (shift.approvedEmployee ?? []).find((e: any) => e?.id === uid);
    if (!applied.includes(uid) && !entry) {
      return corsJson(request, { error: "You haven't applied to this shift" }, 409);
    }
    if (shift.status !== "active") {
      return corsJson(request, { error: `This shift is ${shift.status}, so there's nothing to withdraw from.` }, 409);
    }
    if (entry?.userClockIn) {
      return corsJson(request, { error: "You've already clocked in to this shift." }, 409);
    }

    const msToStart = shiftStart(shift.shiftDate, shift.clockIn).getTime() - Date.now();
    if (msToStart <= 0) {
      return corsJson(request, { error: "This shift has already started. Please call Gilead." }, 409);
    }
    if (entry && msToStart < WITHDRAW_CUTOFF_HOURS * 60 * 60 * 1000) {
      return corsJson(
        request,
        {
          error: `It's less than ${WITHDRAW_CUTOFF_HOURS} hours until this shift starts, so you can't withdraw in the app. Please call Gilead.`,
          code: "too_late",
        },
        409,
      );
    }

    // only if they still haven't clocked in, in case they did at the same moment
    const res = await ShiftModel().updateOne(
      { _id: shiftId, status: "active", approvedEmployee: { $not: { $elemMatch: { id: uid, userClockIn: { $exists: true } } } } },
      {
        $pull: { appliedEmployee: uid, approvedEmployee: { id: uid } },
        $push: { withdrawals: { id: uid, at: new Date().toISOString(), wasAssigned: !!entry } },
      },
    );
    if (res.modifiedCount === 0) {
      return corsJson(request, { error: "Couldn't withdraw from this shift. Pull to refresh and try again." }, 409);
    }

    if (entry) await removeFromNextShifts([uid], shiftId);

    return corsJson(request, { message: entry ? "You've withdrawn from this shift" : "Application withdrawn" }, 200);
  } catch (error: any) {
    console.error("Error withdrawing from shift:", error);
    return corsJson(request, { error: "Failed to withdraw from shift" }, 500);
  }
}
