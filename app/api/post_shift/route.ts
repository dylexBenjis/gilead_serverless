// create, update, and delete shifts in mongodb (admin only)
import { NextRequest, after } from "next/server";
import mongoose from "mongoose";
import { shiftSchema } from "@/app/schemas/shift_schema";
import { connect_to_mongodb } from "../mongodb";
import { corsJson, corsPreflight } from "../_cors";
import { requireAdminSession } from "../_auth";
import { ShiftModel } from "../_shift";
import { geocodePostcode } from "../_geo";
import { describeShiftTime, notifyAllWorkers } from "../_notify";
import { removeFromNextShifts } from "../_worker_shifts";
import { cancelShift, finishShift } from "../_shift_lifecycle";

const METHODS = "POST, PUT, DELETE, OPTIONS";

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request, METHODS);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminSession(request, METHODS);
  if (denied) return denied;

  try {
    const shiftData = await request.json();

    // id is assigned by Mongo, never trust one from the client on create
    const { id, ...rest } = shiftData;
    // coordinates are always worked out here from the postcode, never taken from the client
    const parsedShift = shiftSchema.omit({ id: true, shiftLat: true, shiftLng: true }).parse(rest);
    const coords = await geocodePostcode(parsedShift.shiftPostCode);
    if (coords === null) {
      return corsJson(request, { error: `Postcode "${parsedShift.shiftPostCode}" wasn't recognised. Check it and try again.` }, 400);
    }

    await connect_to_mongodb();

    const newShift = new (ShiftModel())({
      ...parsedShift,
      // every shift starts active; completed / incomplete / cancelled are reached by closing it
      status: "active",
      // a new shift starts with nobody on it; workers apply via /api/apply_shift
      appliedEmployee: [],
      approvedEmployee: [],
      // undefined when the postcode lookup service was unreachable; get_shift fills it in later
      ...(coords ? { shiftLat: coords.lat, shiftLng: coords.lng } : {}),
      createdAt: new Date().toISOString(),
    });
    await newShift.save();

    // Tell workers about it once the admin has their response (sending to everyone can take a moment)
    const where = [parsedShift.client, parsedShift.shiftPostCode].filter(Boolean).join(", ");
    after(() =>
      notifyAllWorkers({
        title: `New ${parsedShift.category || "shift"} shift available`,
        body: `${describeShiftTime(parsedShift)}${where ? ` at ${where}` : ""}`,
        data: { type: "shift_posted", shiftId: String(newShift._id) },
      }),
    );

    return corsJson(request, { message: "Shift saved successfully", id: String(newShift._id) }, 200);
  } catch (error: any) {
    console.error("Error saving shift:", error);
    return corsJson(request, { error: "Failed to save shift", details: error?.message }, 400);
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireAdminSession(request, METHODS);
  if (denied) return denied;

  try {
    const shiftData = await request.json();
    const { id, ...rest } = shiftData;

    if (!id) {
      return corsJson(request, { error: "Shift id is required to update a shift" }, 400);
    }
    if (!mongoose.isValidObjectId(id)) {
      return corsJson(request, { error: "Shift not found" }, 404);
    }

    // Applicants, assignments and clock times are owned by apply_shift / assign_shift /
    // user_clockin_clockout. The edit form sends back whatever it loaded, so writing these
    // here would wipe any clock-ins or assignments made while the admin had the form open.
    const { appliedEmployee, approvedEmployee, withdrawals, ...editable } = shiftSchema
      .omit({ id: true, shiftLat: true, shiftLng: true })
      .partial()
      .parse(rest);

    // postcode changed (or re-sent): refresh the coordinates used for distance and clock-in checks
    const update: Record<string, unknown> = { ...editable };
    const unset: Record<string, ""> = {};
    if (editable.shiftPostCode) {
      const coords = await geocodePostcode(editable.shiftPostCode);
      if (coords === null) {
        return corsJson(request, { error: `Postcode "${editable.shiftPostCode}" wasn't recognised. Check it and try again.` }, 400);
      }
      if (coords) Object.assign(update, { shiftLat: coords.lat, shiftLng: coords.lng });
      else Object.assign(unset, { shiftLat: "", shiftLng: "" }); // lookup down: clear stale coords, get_shift refills
    }

    await connect_to_mongodb();

    const current: any = await ShiftModel().findById(id).lean();
    if (!current) {
      return corsJson(request, { error: "Shift not found" }, 404);
    }

    // Status only moves forward: active -> completed / cancelled. A closed shift can't be reopened
    // (workers have been told and their lists updated), so post a new shift instead.
    const from = current.status ?? "active";
    const to = editable.status ?? from;
    delete update.status; // status changes go through finishShift / cancelShift below
    if (to !== from && from !== "active") {
      return corsJson(
        request,
        { error: `This shift is already ${from} and can't be changed to ${to}. Post a new shift instead.` },
        409,
      );
    }

    const updated = await ShiftModel()
      .findByIdAndUpdate(
        id,
        { $set: { ...update, updatedAt: new Date().toISOString() }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { new: true },
      )
      .lean();

    if (!updated) {
      return corsJson(request, { error: "Shift not found" }, 404);
    }

    // Closing a shift records each worker's result and updates their own lists
    if (to !== from && (to === "completed" || to === "incomplete")) {
      // closed early by the admin: anyone still clocked in is clocked out now
      const status = await finishShift(updated, new Date());
      return corsJson(request, { message: `Shift closed as ${status ?? "finished"}`, status }, 200);
    }
    if (to !== from && to === "cancelled") {
      await cancelShift(updated);
      return corsJson(request, { message: "Shift cancelled. Assigned workers have been notified.", status: "cancelled" }, 200);
    }

    return corsJson(request, { message: "Shift updated successfully" }, 200);
  } catch (error: any) {
    console.error("Error updating shift:", error);
    return corsJson(request, { error: "Failed to update shift", details: error?.message }, 400);
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdminSession(request, METHODS);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return corsJson(request, { error: "Shift id is required to delete a shift" }, 400);
    }
    if (!mongoose.isValidObjectId(id)) {
      return corsJson(request, { error: "Shift not found" }, 404);
    }

    await connect_to_mongodb();

    const deleted = await ShiftModel().findByIdAndDelete(id).lean();
    if (!deleted) {
      return corsJson(request, { error: "Shift not found" }, 404);
    }

    // a deleted shift can't be upcoming for anyone (past shifts are kept as a record of work done)
    const approved: any[] = (deleted as any).approvedEmployee ?? [];
    await removeFromNextShifts(approved.map((e) => e?.id).filter(Boolean), String(id));

    return corsJson(request, { message: "Shift deleted successfully" }, 200);
  } catch (error: any) {
    console.error("Error deleting shift:", error);
    return corsJson(request, { error: "Failed to delete shift", details: error?.message }, 400);
  }
}
