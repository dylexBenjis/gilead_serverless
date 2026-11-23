// app/firebase-admin.ts
import https from 'node:https';
import type { Socket } from 'node:net';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

// Parse your service account key (or import key JSON)
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string
);

// HTTPS agent for Firebase's REST calls and Google access-token fetches. A connection that goes quiet
// for SOCKET_TIMEOUT_MS is destroyed, so the request fails and is retried on a fresh connection.
// Without it, a connection that died silently (e.g. the laptop slept) leaves the access-token fetch
// waiting forever. Every later Auth / Realtime Database call waits on that same fetch, so they all
// hang until the server restarts. Firestore isn't affected: it gets its own tokens over gRPC.
const SOCKET_TIMEOUT_MS = 20_000;

class TimeoutAgent extends https.Agent {
  createConnection(...args: Parameters<https.Agent['createConnection']>) {
    // the base method creates the TLS socket; Node types it loosely, so cast it to a stream
    const socket = (https.Agent.prototype as any).createConnection.apply(this, args) as Socket | undefined;
    socket?.setTimeout?.(SOCKET_TIMEOUT_MS, () =>
      socket.destroy(new Error(`Firebase connection idle for ${SOCKET_TIMEOUT_MS / 1000}s`)),
    );
    return socket as any;
  }
}

const httpAgent = new TimeoutAgent({ keepAlive: true });

// Check if an app is already initialized before creating a new one
export const app = getApps().length === 0
  ? initializeApp({
      credential: cert(serviceAccount, httpAgent),
      databaseURL: process.env.FIREBASE_RT_DATABASE_URL,
      httpAgent,
    })
  : getApp();

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const adminRTDB = getDatabase(app); // If you need to use the Realtime Database

// Reject if `promise` hasn't settled within `ms`, so an API route answers with an error instead of
// leaving the page waiting.
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
