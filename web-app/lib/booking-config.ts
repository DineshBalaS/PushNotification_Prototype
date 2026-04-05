/**
 * Prototype booking: no patient login. The widget uses a single Mongo patient row
 * identified by NEXT_PUBLIC_BOOKING_PATIENT_ID (set in .env.local locally, Vercel env in production).
 */

const OBJECT_ID_HEX = /^[a-f0-9]{24}$/i;

let cachedPatientId: string | null = null;

/**
 * Returns the configured Mongo ObjectId string for the demo patient (lowercased).
 * Call from the booking submit path (client). Throws if unset or invalid so misconfiguration fails loudly.
 */
export function getBookingPatientId(): string {
  if (cachedPatientId !== null) {
    return cachedPatientId;
  }

  const raw = process.env.NEXT_PUBLIC_BOOKING_PATIENT_ID?.trim();
  if (!raw) {
    console.error(
      "[booking] NEXT_PUBLIC_BOOKING_PATIENT_ID is missing; set it in .env.local (see .env.example) or Vercel project env."
    );
    throw new Error("NEXT_PUBLIC_BOOKING_PATIENT_ID is not configured");
  }
  if (!OBJECT_ID_HEX.test(raw)) {
    console.error(
      "[booking] NEXT_PUBLIC_BOOKING_PATIENT_ID must be a 24-character hex MongoDB ObjectId; got length=%s",
      raw.length
    );
    throw new Error("NEXT_PUBLIC_BOOKING_PATIENT_ID is not a valid ObjectId string");
  }

  cachedPatientId = raw.toLowerCase();
  if (process.env.NODE_ENV === "development") {
    console.debug("[booking] resolved prototype patient_id=%s", cachedPatientId);
  }
  return cachedPatientId;
}
