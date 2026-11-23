//get the actual time a user clocked in and clocked out, and update the shift record.

import { NextRequest } from "next/server";
import { connect_to_mongodb } from "../mongodb";
import { corsJson as baseCorsJson, corsPreflight as baseCorsPreflight } from "../_cors";
import { ShiftModel, shiftStart } from "../_shift";
import { describeDistance, distanceMeters, parseLocation, withinSite, CLOCKIN_RADIUS_M } from "../_geo";
import { adminAuth } from "../firebase-admin";
import { moveToPastShifts } from "../_worker_shifts";
// workers may clock in up to 15 mins before the shift starts, and until 15 mins after it ends
import { GRACE_MS } from "../_shift_lifecycle";

const METHODS = "POST, OPTIONS";
const corsJson = (request: Request, data: any, status = 200) => baseCorsJson(request, data, status, METHODS);
const corsPreflight = (request: Request) => baseCorsPreflight(request, METHODS);

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

export async function POST(request: NextRequest) {
  console.log("Received request to update user clock-in time", request.url);
  try {
        const authHeader = request.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return corsJson(request, { error: "Missing or invalid token" }, 401);
        }
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const workerId = decodedToken.uid;

    // times are taken from the server clock, never from the request, so they can't be faked
    const body = await request.json().catch(() => ({}));
    const { shiftId, action } = body;
    // where the phone says it is: { location: { lat, lng, accuracy } }
    const location = parseLocation(body);

    if (!shiftId || !["clockIn", "clockOut"].includes(action)) {
      return corsJson(
        request,
        { error: "shiftId and action ('clockIn' | 'clockOut') are required" },
        400,
      );
    }

    await connect_to_mongodb();
    const shift: any = await ShiftModel().findById(shiftId).lean();
    if (!shift) {
      return corsJson(request, { error: "Shift not found" }, 404);
    }

    const entry = (shift.approvedEmployee ?? []).find((e: any) => e?.id === workerId);
    if (!entry) {
      return corsJson(request, { error: "You are not assigned to this shift" }, 403);
    }

    const now = new Date();

    if (action === "clockIn") {
      if (shift.status === "cancelled") {
        return corsJson(request, { error: "This shift has been cancelled, so you don't need to attend." }, 409);
      }
      if (shift.status !== "active") {
        return corsJson(request, { error: "This shift has finished, so you can no longer clock in." }, 409);
      }
      if (entry.userClockIn) {
        return corsJson(request, { error: "You have already clocked in for this shift" }, 409);
      }

      const start = shiftStart(shift.shiftDate, shift.clockIn);
      const end = new Date(start.getTime() + (shift.regularHours ?? 0) * 60 * 60 * 1000);
      if (now.getTime() < start.getTime() - GRACE_MS || now.getTime() > end.getTime() + GRACE_MS) {
        return corsJson(
          request,
          { error: "Clock-in opens 15 minutes before the shift starts and closes 15 minutes after it ends" },
          403,
        );
      }

      // must be at the site, when the shift has coordinates (set from its postcode)
      const site = shift.shiftLat != null && shift.shiftLng != null ? { lat: shift.shiftLat, lng: shift.shiftLng } : null;
      let clockInLocation: Record<string, number> | undefined;
      if (site) {
        if (!location) {
          return corsJson(request, { error: "Turn on location access for Gilead so we can confirm you're at the shift site.", code: "location_required" }, 400);
        }
        const distanceM = distanceMeters(location, site);
        if (!withinSite(distanceM, location.accuracy)) {
          return corsJson(request, {
            error: `You're about ${describeDistance(distanceM)} from ${shift.shiftLocation || "the shift site"}. You need to be within ${CLOCKIN_RADIUS_M} m to clock in.`,
            code: "too_far",
            distanceM: Math.round(distanceM),
          }, 403);
        }
        clockInLocation = { ...location, distanceM: Math.round(distanceM) };
      } else if (location) {
        clockInLocation = { ...location }; // no site coordinates yet: record where they were, don't block
      }

      // saved as the actual tap time, even when early; the early part is left out of the total at clock-out
      const recorded = now;
      const updateShift = await ShiftModel().updateOne(
        { _id: shiftId, approvedEmployee: { $elemMatch: { id: workerId, userClockIn: { $exists: false } } } },
        {
          $set: {
            "approvedEmployee.$.userClockIn": recorded.toISOString(),
            ...(clockInLocation ? { "approvedEmployee.$.userClockInLocation": clockInLocation } : {}),
          },
        }
      );
      if (updateShift.modifiedCount === 0) {
        return corsJson(request, { error: "You have already clocked in for this shift" }, 409);
      }

      return corsJson(request, { message: "Clocked in", time: recorded.toISOString() }, 200);
    }

    // clockOut
    if (!entry.userClockIn) {
      return corsJson(request, { error: "You need to clock in before you can clock out" }, 409);
    }
    if (entry.userClockOut) {
      return corsJson(request, {
        error: entry.autoClockOut
          ? "You were clocked out automatically when the shift closed."
          : "You have already clocked out of this shift",
      }, 409);
    }

    // userClockIn and userClockOut are the actual tap times, but only time inside the scheduled shift
    // is counted: from the later of clock-in and scheduled start, to the earlier of clock-out and scheduled end
    const start = shiftStart(shift.shiftDate, shift.clockIn);
    const end = new Date(start.getTime() + (shift.regularHours ?? 0) * 60 * 60 * 1000);
    const clockedInAt = new Date(entry.userClockIn);
    const countedFrom = clockedInAt > start ? clockedInAt : start;
    const countedUntil = now < end ? now : end;
    const userTotalWorkTime = Math.max(0, Math.floor((countedUntil.getTime() - countedFrom.getTime()) / 60000));

    const updateShift = await ShiftModel().updateOne(
      {
        _id: shiftId,
        approvedEmployee: { $elemMatch: { id: workerId, userClockIn: { $exists: true }, userClockOut: { $exists: false } } },
      },
      {
        $set: {
          "approvedEmployee.$.userClockOut": now.toISOString(),
          "approvedEmployee.$.userTotalWorkTime": userTotalWorkTime,
          "approvedEmployee.$.attendance": "completed",
          // recorded for the admin, but never blocks: a worker who has already left can still clock out
          ...(location
            ? {
                "approvedEmployee.$.userClockOutLocation": {
                  ...location,
                  ...(shift.shiftLat != null && shift.shiftLng != null
                    ? { distanceM: Math.round(distanceMeters(location, { lat: shift.shiftLat, lng: shift.shiftLng })) }
                    : {}),
                },
              }
            : {}),
        },
      }
    );
    if (updateShift.modifiedCount === 0) {
      return corsJson(request, { error: "You have already clocked out of this shift" }, 409);
    }

    // shift worked: move it from the worker's upcoming shifts to their past shifts
    await moveToPastShifts(workerId, String(shiftId));

    return corsJson(request, { message: "Clocked out", time: now.toISOString(), userTotalWorkTime }, 200);
  } catch (error: any) {
    console.error("Error updating user clock-in/clock-out time:", error);
    return corsJson(request, { error: "Failed to update user clock-in/clock-out time", details: error?.message }, 400);
  }
}
