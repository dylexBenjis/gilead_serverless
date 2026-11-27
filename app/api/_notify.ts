// Push notifications to workers' phones through Firebase Cloud Messaging.
// Each worker's FCM tokens live in Firestore devices/{uid}.tokens (server-only;
// firestore.rules denies clients). One token per installed app / phone.
import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { adminDb, app, withTimeout } from "./firebase-admin";

export const devicesDoc = (uid: string) => adminDb.collection("devices").doc(uid);

type Push = { title: string; body: string; data?: Record<string, string> };

// Sends one push to a list of tokens (FCM allows 500 per call) and returns the ones
// FCM says are dead (app uninstalled / registration expired) so the caller can remove them.
async function sendToTokens(tokens: string[], push: Push) {
  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await getMessaging(app).sendEachForMulticast({
      tokens: batch,
      notification: { title: push.title, body: push.body },
      data: push.data ?? {},
      android: { priority: "high", notification: { sound: "default" } },
      apns: { payload: { aps: { sound: "default" } } },
      // web app (iPhone home-screen app, browsers): paths are on the worker app's own site
      webpush: {
        headers: { Urgency: "high" },
        notification: { icon: "/icons/icon-192.png", badge: "/icons/badge-96.png" },
      },
    });
    sent += res.successCount;
    res.responses.forEach((r, j) => {
      if (!r.success && isDeadToken(r.error?.code)) dead.push(batch[j]);
    });
  }
  return { sent, dead };
}

// Best effort: never throws, so a notification failure can't fail the request that triggered it.
export async function notifyWorker(uid: string, push: Push) {
  try {
    const snap = await withTimeout(devicesDoc(uid).get(), 10_000, "Loading devices");
    const tokens: string[] = snap.exists ? snap.data()?.tokens ?? [] : [];
    if (tokens.length === 0) return { sent: 0 };

    const { sent, dead } = await sendToTokens(tokens, push);
    if (dead.length) await devicesDoc(uid).update({ tokens: FieldValue.arrayRemove(...dead) });
    return { sent };
  } catch (error) {
    console.error(`Error sending push to ${uid}:`, error);
    return { sent: 0 };
  }
}

// Every worker who has allowed notifications (e.g. "new shift posted"). Best effort, never throws.
export async function notifyAllWorkers(push: Push) {
  try {
    const snap = await withTimeout(adminDb.collection("devices").get(), 15_000, "Loading devices");
    const owner = new Map<string, string>(); // token -> uid, for cleaning up dead tokens
    for (const doc of snap.docs) {
      for (const t of (doc.data().tokens ?? []) as string[]) owner.set(t, doc.id);
    }
    if (owner.size === 0) return { sent: 0 };

    const { sent, dead } = await sendToTokens([...owner.keys()], push);
    await Promise.all(
      dead.map((t) => devicesDoc(owner.get(t)!).update({ tokens: FieldValue.arrayRemove(t) })),
    );
    return { sent };
  } catch (error) {
    console.error("Error sending push to all workers:", error);
    return { sent: 0 };
  }
}

function isDeadToken(code?: string) {
  return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
}

// "Tue 10 Nov · 09:00–17:00"
export function describeShiftTime(shift: { shiftDate?: string; clockIn?: string; clockOut?: string }) {
  const d = shift.shiftDate ? new Date(`${shift.shiftDate}T12:00:00Z`) : null;
  const day = d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    : shift.shiftDate ?? "";
  return `${day} · ${shift.clockIn ?? ""}–${shift.clockOut ?? ""}`;
}
