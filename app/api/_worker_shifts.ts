// Keeps each worker's own lists in Firestore users/{uid} in step with the shifts in Mongo:
//   nextShifts: shift ids they're assigned to and haven't worked yet
//   pastShifts: shift ids they've worked (clocked out of)
// Mongo stays the source of truth; these lists drive the "Upcoming" / "Shifts completed"
// counts, so failures are logged and never fail the request that triggered them.
// Only the server writes these (firestore.rules blocks workers from changing them).
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, withTimeout } from "./firebase-admin";
import { attended } from "./_shift";

const userDoc = (uid: string) => adminDb.collection("users").doc(uid);

// Best-effort profile updates must never hold a request up (a dead connection can stall a
// Firestore write for minutes), so give up after 10 s; the error is logged by the caller.
const FIRESTORE_MS = 10_000;
const update = (uid: string, data: Record<string, unknown>) =>
  withTimeout(userDoc(uid).update(data), FIRESTORE_MS, `Updating ${uid}'s shift lists`);

// Worker finished the shift: upcoming -> past
export async function moveToPastShifts(uid: string, shiftId: string) {
  try {
    await update(uid, {
      nextShifts: FieldValue.arrayRemove(shiftId),
      pastShifts: FieldValue.arrayUnion(shiftId),
    });
  } catch (error) {
    console.error(`Error moving shift ${shiftId} to past shifts for ${uid}:`, error);
  }
}

// Admin set their hours to nothing: it no longer counts as a shift they worked
export async function removeFromPastShifts(uid: string, shiftId: string) {
  try {
    await update(uid, { pastShifts: FieldValue.arrayRemove(shiftId), nextShifts: FieldValue.arrayRemove(shiftId) });
  } catch (error) {
    console.error(`Error removing shift ${shiftId} from ${uid}'s past shifts:`, error);
  }
}

// Shift cancelled / deleted, or closed without them working it: just drop it from upcoming
export async function removeFromNextShifts(uids: string[], shiftId: string) {
  await Promise.all(
    uids.map((uid) =>
      update(uid, { nextShifts: FieldValue.arrayRemove(shiftId) })
        .catch((error) => console.error(`Error removing shift ${shiftId} from ${uid}'s upcoming shifts:`, error)),
    ),
  );
}

type ApprovedEntry = { id?: string; userClockIn?: string; userClockOut?: string; attendance?: string };

// Admin closed the shift (status "completed"): everyone who clocked in worked it, the rest didn't.
export async function closeShiftForWorkers(shiftId: string, approved: ApprovedEntry[] = []) {
  const worked = approved.filter((e) => e?.id && attended(e)).map((e) => e.id!);
  const didNotWork = approved.filter((e) => e?.id && !attended(e)).map((e) => e.id!);
  await Promise.all([
    ...worked.map((uid) => moveToPastShifts(uid, shiftId)),
    removeFromNextShifts(didNotWork, shiftId),
  ]);
}
