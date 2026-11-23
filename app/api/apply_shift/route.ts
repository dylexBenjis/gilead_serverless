// a signed-in worker applies to (claims) a shift
import mongoose from "mongoose";
import { connect_to_mongodb } from "../mongodb";
import { corsJson, corsPreflight } from "../_cors";
import { requireWorker } from "../_auth";
import { ShiftModel, describeClash, findClash, shiftStart } from "../_shift";

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function POST(request: Request) {
  const worker = await requireWorker(request);
  if (worker.denied) return worker.denied;
  const uid = worker.uid;

  try {
    const { shiftId } = await request.json().catch(() => ({}));
    if (!shiftId || typeof shiftId !== "string") {
      return corsJson(request, { error: "shiftId is required" }, 400);
    }
    if (!mongoose.isValidObjectId(shiftId)) {
      return corsJson(request, { error: "Shift not found" }, 404);
    }

    await connect_to_mongodb();
    const shift: any = await ShiftModel().findById(shiftId).lean();
    if (!shift) {
      return corsJson(request, { error: "Shift not found" }, 404);
    }

    const applied: string[] = shift.appliedEmployee ?? [];
    const approved: { id: string }[] = shift.approvedEmployee ?? [];

    if (applied.includes(uid) || approved.some((e) => e?.id === uid)) {
      return corsJson(request, { message: "You have already applied to this shift" }, 200);
    }
    if (shift.status !== "active") {
      return corsJson(request, { error: "This shift is no longer open" }, 409);
    }
    if (!shift.shiftDate || !shift.clockIn || shiftStart(shift.shiftDate, shift.clockIn).getTime() <= Date.now()) {
      return corsJson(request, { error: "This shift has already started" }, 409);
    }
    if (approved.length >= (shift.number_of_needed_employee ?? 0)) {
      return corsJson(request, { error: "This shift is already fully staffed" }, 409);
    }

    // can't be in two places at once
    const clash = await findClash(uid, shift);
    if (clash) {
      return corsJson(request, { error: `You're already booked on ${describeClash(clash)}, which overlaps this shift.` }, 409);
    }

    // Re-check status in the write itself, in case an admin cancelled it in the meantime
    const result = await ShiftModel().updateOne(
      { _id: shiftId, status: "active" },
      { $addToSet: { appliedEmployee: uid } },
    );
    if (result.matchedCount === 0) {
      return corsJson(request, { error: "This shift is no longer open" }, 409);
    }

    return corsJson(request, { message: "Applied to shift successfully" }, 200);
  } catch (error: any) {
    console.error("Error applying to shift:", error);
    return corsJson(request, { error: "Failed to apply to shift" }, 500);
  }
}
