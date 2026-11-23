// A worker's phone registers (POST) or removes (DELETE) its push-notification token.
import { FieldValue } from "firebase-admin/firestore";
import { corsJson as baseCorsJson, corsPreflight as baseCorsPreflight } from "../_cors";
import { requireWorker } from "../_auth";
import { devicesDoc } from "../_notify";

const METHODS = "POST, DELETE, OPTIONS";
const corsJson = (request: Request, data: any, status = 200) => baseCorsJson(request, data, status, METHODS);

export async function OPTIONS(request: Request) {
  return baseCorsPreflight(request, METHODS);
}

async function readToken(request: Request) {
  const { token } = await request.json().catch(() => ({}));
  // FCM tokens are long opaque strings; reject anything that clearly isn't one
  return typeof token === "string" && token.length >= 20 && token.length <= 4096 ? token : null;
}

export async function POST(request: Request) {
  const worker = await requireWorker(request);
  if (worker.denied) return worker.denied;
  const token = await readToken(request);
  if (!token) return corsJson(request, { error: "token is required" }, 400);

  try {
    await devicesDoc(worker.uid).set(
      { tokens: FieldValue.arrayUnion(token), updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return corsJson(request, { message: "Device registered" });
  } catch (error) {
    console.error("Error registering device:", error);
    return corsJson(request, { error: "Could not register device" }, 500);
  }
}

export async function DELETE(request: Request) {
  const worker = await requireWorker(request);
  if (worker.denied) return worker.denied;
  const token = await readToken(request);
  if (!token) return corsJson(request, { error: "token is required" }, 400);

  try {
    await devicesDoc(worker.uid).set({ tokens: FieldValue.arrayRemove(token) }, { merge: true });
    return corsJson(request, { message: "Device removed" });
  } catch (error) {
    console.error("Error removing device:", error);
    return corsJson(request, { error: "Could not remove device" }, 500);
  }
}
