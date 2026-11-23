// schemas/shiftSchema.ts
import { z } from 'zod';

export const ShiftStatusEnum = z.enum(['active', 'completed', 'incomplete', 'cancelled']);

export const shiftSchema = z.object({
  //---client---
  client: z.string().optional(),
  
  //---location of shift---
  shiftLocation: z.string(),
  shiftPostCode: z.string(),
  // coordinates of the postcode, set by the server (postcodes.io); used for distance + clock-in checks
  shiftLat: z.number().optional(),
  shiftLng: z.number().optional(),

  //---category
  category: z.string(),

  // --- Identifiers ---
  id: z.string(), // Provided by Firestore doc ID
  userId: z.array(z.string().min(1, 'User ID is required')),

  // --- Timestamps (ISO 8601 strings) ---
  clockIn: z.string(),
  clockOut: z.string(),

  // --- Break & Pay Calculations ---
  breakMinutes: z.number().min(0, 'Break minutes cannot be negative').default(0),
  hourlyRate: z.number().positive('Hourly rate must be greater than 0'),
  regularHours: z.number().min(0).default(0),
  shiftPay: z.number().min(0).default(0),

  // --- Status & Notes ---
  status: ShiftStatusEnum.default('active'),
  notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),


  // --- Derived Query Indexes ---
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be format YYYY-MM-DD'),
  yearWeek: z.string().regex(/^\d{4}-W\d{2}$/, 'Must be format YYYY-Www'),
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be format YYYY-MM'),

  // ----applied employee(S) and approved employee(s)
  number_of_needed_employee: z.number(),
  appliedEmployee: z.array(z.string()).default([]),
  approvedEmployee: z.array(z.object(
    { id: z.string() , 
    // --- actual user clock in and clock out ---
    userClockIn: z.string().optional(),
    userClockOut: z.string().optional(),
    // --- minutes worked (userClockOut - userClockIn), set by the server on clock-out ---
    userTotalWorkTime: z.number().optional(),
    // --- set when the shift closes: clocked in = completed, never clocked in = incomplete ---
    attendance: z.enum(['completed', 'incomplete']).optional(),
    // --- true when they forgot to clock out and the server did it at the shift's end ---
    autoClockOut: z.boolean().optional(),
    // --- hours corrected by an admin after the shift (minutes = what's paid) ---
    adjusted: z.object({ minutes: z.number(), previousMinutes: z.number().nullable().optional(), note: z.string(), by: z.string(), at: z.string() }).optional(),
    // --- when the start / clock-out reminders were pushed ---
    reminderStartSent: z.string().optional(),
    reminderEndSent: z.string().optional(),
    // where the worker was when they tapped clock in / out (distanceM = metres from the site)
    userClockInLocation: z.object({ lat: z.number(), lng: z.number(), accuracy: z.number(), distanceM: z.number().optional() }).optional(),
    userClockOutLocation: z.object({ lat: z.number(), lng: z.number(), accuracy: z.number(), distanceM: z.number().optional() }).optional(),}
  )).default([]),

  // ----workers who withdrew (wasAssigned = they'd been assigned, not just applied)
  withdrawals: z.array(z.object({ id: z.string(), at: z.string(), wasAssigned: z.boolean() })).optional(),

});

// Infer TypeScript type directly from the Zod schema
export type ShiftProps = z.infer<typeof shiftSchema>;