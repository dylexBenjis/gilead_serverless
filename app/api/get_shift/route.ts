// get shift data from mongodb
// - admins (Auth0 session) get full shift records
// - workers (Firebase ID token) get open shifts plus shifts they're on, with other workers' data removed
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connect_to_mongodb } from "../mongodb";
import { corsJson, corsPreflight } from "../_cors";
import { hasAdminSession, requireWorker } from "../_auth";
import { ShiftModel, forWorker, normalize, shiftStart } from "../_shift";
import { geocodePostcodes, postcodeKey } from "../_geo";
import { finishEndedShifts } from "../_shift_lifecycle";

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

export async function GET(request: NextRequest) {
  const isAdmin = await hasAdminSession(request);
  let uid: string | undefined;
  if (!isAdmin) {
    const worker = await requireWorker(request);
    if (worker.denied) return worker.denied;
    uid = worker.uid;
  }

  try {
    await connect_to_mongodb();
    // close shifts whose clock-out window has passed, so everyone sees the right status
    await finishEndedShifts();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      if (!mongoose.isValidObjectId(id)) return corsJson(request, { error: "Shift not found" }, 404);
      const shift = await ShiftModel().findById(id).lean();
      if (!shift) return corsJson(request, { error: "Shift not found" }, 404);
      const [doc] = await withCoordinates([normalize(shift)]);
      return corsJson(request, { shift: isAdmin ? doc : forWorker(doc, uid!) }, 200);
    }

    const shifts = await withCoordinates((await ShiftModel().find().sort({ shiftDate: 1 }).lean()).map(normalize));
    if (isAdmin) return corsJson(request, { shifts }, 200);

    // Workers see shifts they've applied to / been assigned to, plus active shifts that haven't started yet
    const now = Date.now();
    const visible = shifts.filter((s: any) => {
      const involved =
        (s.appliedEmployee ?? []).includes(uid) || (s.approvedEmployee ?? []).some((e: any) => e?.id === uid);
      if (involved) return true;
      if (s.status !== "active" || !s.shiftDate || !s.clockIn) return false;
      return shiftStart(s.shiftDate, s.clockIn).getTime() > now;
    });
    return corsJson(request, { shifts: visible.map((s: any) => forWorker(s, uid!)) }, 200);
  } catch (error: any) {
    console.error("Error fetching shifts:", error);
    return corsJson(request, { error: "Failed to fetch shifts" }, 500);
  }
}

// Shifts posted before coordinates existed (or while postcodes.io was down) have no
// shiftLat/shiftLng. Look them up in one batch, save them, and return the filled-in docs.
async function withCoordinates(shifts: any[]) {
  const missing = shifts.filter((s) => s.shiftLat == null && s.shiftPostCode);
  if (missing.length === 0) return shifts;
  const found = await geocodePostcodes(missing.map((s) => s.shiftPostCode));
  const writes = [];
  for (const s of missing) {
    const c = found.get(postcodeKey(s.shiftPostCode));
    if (!c) continue;
    s.shiftLat = c.lat;
    s.shiftLng = c.lng;
    writes.push({ updateOne: { filter: { _id: s.id }, update: { $set: { shiftLat: c.lat, shiftLng: c.lng } } } });
  }
  if (writes.length) {
    await ShiftModel().bulkWrite(writes).catch((e: any) => console.error("Error saving shift coordinates:", e));
  }
  return shifts;
}
