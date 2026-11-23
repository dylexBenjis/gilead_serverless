// approve (assign) or unassign an applicant for a shift
import { NextRequest } from "next/server";
import { connect_to_mongodb } from "../mongodb";
import { corsJson as baseCorsJson, corsPreflight as baseCorsPreflight } from "../_cors";
import { requireAdminSession } from "../_auth";
import { adminDb, withTimeout } from "../firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyWorker, describeShiftTime } from "../_notify";
import mongoose from "mongoose";
import { describeClash, findClash } from "../_shift";
import { ShiftProps } from "@/app/schemas/shift_schema";

const METHODS = "POST, OPTIONS";
const corsJson = (request: Request, data: any, status = 200) => baseCorsJson(request, data, status, METHODS);
const corsPreflight = (request: Request) => baseCorsPreflight(request, METHODS);

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

const ShiftModel = () =>{
  return mongoose.models.Shift || mongoose.model("Shift", new mongoose.Schema({}, { strict: false }));
}

export async function POST(request: NextRequest) {
  console.log("Received request to assign/unassign shift:", request.url);
  const denied = await requireAdminSession(request, METHODS);
  if (denied) return denied;

  try {
    const { shiftId, workerId, action } = await request.json();

    if (!shiftId || !workerId || !["approve", "unassign"].includes(action)) {
      return corsJson(
        request,
        { error: "shiftId, workerId and action ('approve' | 'unassign') are required" },
        400,
      );
    }

    await connect_to_mongodb();
    const shift: any = await ShiftModel().findById(
      shiftId
    );
    if (!shift) {
      return corsJson(request, { error: "Shift not found" }, 404);
    }

    const applied: string[] = shift.appliedEmployee ?? [];
    const approved: ShiftProps["approvedEmployee"] = shift.approvedEmployee ?? [];
    const needed = shift.number_of_needed_employee ?? 0;

    if (shift.status !== "active") {
      return corsJson(request, { error: `This shift is ${shift.status ?? "closed"}, so its workers can't be changed.` }, 409);
    }

    if (action === "approve") {
      if (!applied.includes( workerId )) {
        return corsJson(request, { error: "This worker has not applied to this shift" }, 400);
      }
      if (approved.some( (e) => e.id === workerId )) {
        return corsJson(request, { message: "Worker already assigned" }, 200);
      }
      if (approved.length >= needed) {
        return corsJson(request, { error: "This shift is already fully staffed" }, 409);
      }
      // no double-booking: the worker can't be on two shifts at the same time
      const clash = await findClash(workerId, shift);
      if (clash) {
        return corsJson(request, { error: `Already booked on ${describeClash(clash)}, which overlaps this shift.` }, 409);
      }
      console.log(`Approving worker ${workerId} for shift ${shiftId}`);
      const updatedShift: any = await ShiftModel().findByIdAndUpdate(
        shiftId,
        { $addToSet: { approvedEmployee: { id: workerId } } },
        { new: true },
      );
      console.log(`Updated shift after approval result:`, updatedShift);
    } else {
      // unassign
      const updatedShift: any = await ShiftModel().findByIdAndUpdate(shiftId, {
        $pull: { approvedEmployee: { id: workerId } },
      });
      console.log(`Updated shift after unassignment result:`, updatedShift);
    }

    // Keep the worker's own profile doc in sync so their "Upcoming Shifts"
    // stat and My Shifts screen reflect the assignment immediately. This is
    // best-effort: the Mongo shift record above is the source of truth, so
    // a failure here is logged but doesn't fail the request.
    try {
      const shiftIdStr = String(shift._id);
      const userRef = adminDb.collection("users").doc(workerId);
      if (action === "approve") {
        await withTimeout(userRef.update({ nextShifts: FieldValue.arrayUnion(shiftIdStr) }), 10_000, "Updating upcoming shifts");
      } else {
        await withTimeout(userRef.update({ nextShifts: FieldValue.arrayRemove(shiftIdStr) }), 10_000, "Updating upcoming shifts");
      }
    } catch (syncError) {
      console.error("Error syncing worker profile after assignment:", syncError);
    }

    // Tell the worker on their phone (best effort, never fails the request)
    const where = [shift.client, shift.shiftLocation].filter(Boolean).join(", ");
    await notifyWorker(workerId, action === "approve"
      ? {
          title: "You're confirmed for a shift",
          body: `${describeShiftTime(shift)}${where ? ` at ${where}` : ""}`,
          data: { type: "shift_approved", shiftId: String(shift._id) },
        }
      : {
          title: "You've been removed from a shift",
          body: `${describeShiftTime(shift)}${where ? ` at ${where}` : ""}. Contact Gilead if this is unexpected.`,
          data: { type: "shift_unassigned", shiftId: String(shift._id) },
        });

    return corsJson(
      request,
      { message: action === "approve" ? "Worker assigned to shift" : "Worker unassigned from shift" },
      200,
    );
  } catch (error: any) {
    console.error("Error assigning shift:", error);
    return corsJson(request, { error: "Failed to update shift assignment", details: error?.message }, 400);
  }
}
