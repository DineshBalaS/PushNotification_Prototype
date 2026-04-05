declare namespace NodeJS {
  interface ProcessEnv {
    /** FastAPI base URL, no trailing slash */
    NEXT_PUBLIC_API_BASE_URL?: string;
    /** Mongo patient _id (24 hex) for anonymous prototype booking */
    NEXT_PUBLIC_BOOKING_PATIENT_ID?: string;
  }
}
