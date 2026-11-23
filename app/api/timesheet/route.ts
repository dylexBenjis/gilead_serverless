// Timesheet export for payroll, as a CSV download (admin only).
//   GET /api/timesheet?from=YYYY-MM-DD&to=YYYY-MM-DD            one row per worker per shift
//   GET /api/timesheet?from=...&to=...&view=summary              one row per worker with totals
// Covers closed shifts (completed / incomplete / cancelled) dated from..to inclusive.
// Pay = hours worked (inside the scheduled hours, or as adjusted by an admin) × the shift's hourly rate.
import { NextRequest, NextResponse } from "next/server";
import { connect_to_mongodb } from "../mongodb";
import { requireAdminSession } from "../_auth";
import { adminAuth, adminDb, withTimeout } from "../firebase-admin";
import { ShiftModel, attended } from "../_shift";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TZ = process.env.SHIFT_TIMEZONE || "Europe/London";

// quote for CSV, and stop spreadsheet apps treating a value as a formula
function cell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

const time = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "";
const round2 = (n: number) => Math.round(n * 100) / 100;

async function workerNames() {
  const [users, auth] = await Promise.all([
    withTimeout(adminDb.collection("users").get(), 15_000, "Loading workers"),
    withTimeout(adminAuth.listUsers(1000), 15_000, "Loading worker emails").catch(() => null),
  ]);
  const email = new Map(auth?.users.map((u) => [u.uid, u.email ?? ""]) ?? []);
  const info = new Map<string, { name: string; email: string }>();
  for (const d of users.docs) {
    const u = d.data();
    info.set(d.id, { name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || d.id, email: email.get(d.id) ?? u.email ?? "" });
  }
  return (uid: string) => info.get(uid) ?? { name: uid, email: email.get(uid) ?? "" };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminSession(request, "GET, OPTIONS");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const summary = searchParams.get("view") === "summary";
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return NextResponse.json({ error: "from and to are required as YYYY-MM-DD, with from on or before to" }, { status: 400 });
  }

  try {
    await connect_to_mongodb();
    const [shifts, who] = await Promise.all([
      ShiftModel()
        .find({ shiftDate: { $gte: from, $lte: to }, status: { $ne: "active" } })
        .sort({ shiftDate: 1, clockIn: 1 })
        .lean() as Promise<any[]>,
      workerNames(),
    ]);

    const lines: {
      uid: string; shift: any; e: any; minutes: number; pay: number; result: string; note: string;
    }[] = [];
    for (const s of shifts) {
      for (const e of (s.approvedEmployee ?? []) as any[]) {
        if (!e?.id) continue;
        const did = attended(e);
        // a cancelled shift nobody started isn't anyone's timesheet entry
        if (s.status === "cancelled" && !did) continue;
        const minutes = did ? e.userTotalWorkTime ?? 0 : 0;
        const notes = [
          s.status === "cancelled" ? "Shift cancelled" : "",
          e.autoClockOut ? "Didn't clock out (clocked out automatically)" : "",
          e.adjusted ? `Adjusted by ${e.adjusted.by}: ${e.adjusted.note}` : "",
        ].filter(Boolean);
        lines.push({
          uid: e.id, shift: s, e, minutes,
          pay: round2(((s.hourlyRate ?? 0) * minutes) / 60),
          result: did ? "Completed" : "Incomplete",
          note: notes.join("; "),
        });
      }
    }

    let body: string;
    if (summary) {
      const per = new Map<string, { shifts: number; incomplete: number; minutes: number; pay: number }>();
      for (const l of lines) {
        const t = per.get(l.uid) ?? { shifts: 0, incomplete: 0, minutes: 0, pay: 0 };
        if (l.result === "Completed") t.shifts++;
        else t.incomplete++;
        t.minutes += l.minutes;
        t.pay = round2(t.pay + l.pay);
        per.set(l.uid, t);
      }
      const rows = [...per.entries()]
        .map(([uid, t]) => ({ ...who(uid), ...t }))
        .sort((a, b) => a.name.localeCompare(b.name));
      body = csv([
        ["Worker", "Email", "Shifts worked", "Incomplete shifts", "Minutes worked", "Hours worked", "Pay (GBP)"],
        ...rows.map((r) => [r.name, r.email, r.shifts, r.incomplete, r.minutes, (r.minutes / 60).toFixed(2), r.pay.toFixed(2)]),
        [],
        ["Total", "", rows.reduce((a, r) => a + r.shifts, 0), rows.reduce((a, r) => a + r.incomplete, 0),
          rows.reduce((a, r) => a + r.minutes, 0), (rows.reduce((a, r) => a + r.minutes, 0) / 60).toFixed(2),
          rows.reduce((a, r) => a + r.pay, 0).toFixed(2)],
      ]);
    } else {
      body = csv([
        ["Worker", "Email", "Date", "Client", "Location", "Postcode", "Scheduled start", "Scheduled end",
          "Clock in", "Clock out", "Minutes worked", "Hours worked", "Hourly rate (GBP)", "Pay (GBP)", "Result", "Notes"],
        ...lines.map((l) => {
          const w = who(l.uid);
          return [w.name, w.email, l.shift.shiftDate, l.shift.client ?? "", l.shift.shiftLocation ?? "", l.shift.shiftPostCode ?? "",
            l.shift.clockIn, l.shift.clockOut, time(l.e.userClockIn), time(l.e.userClockOut), l.minutes,
            (l.minutes / 60).toFixed(2), (l.shift.hourlyRate ?? 0).toFixed(2), l.pay.toFixed(2), l.result, l.note];
        }),
      ]);
    }

    const name = `gilead-timesheet${summary ? "-summary" : ""}-${from}-to-${to}.csv`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Error building timesheet:", error);
    return NextResponse.json({ error: "Failed to build timesheet", details: error?.message }, { status: 500 });
  }
}
