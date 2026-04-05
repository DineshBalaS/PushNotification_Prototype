"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const BookingModal = dynamic(
  () => import("@/components/booking/BookingModal"),
  {
    ssr: false,
    loading: () => {
      if (process.env.NODE_ENV === "development") {
        console.debug("[dentist-landing] booking modal chunk loading");
      }
      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-teal-950/30 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <span className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-teal-900 shadow">
            Loading booking…
          </span>
        </div>
      );
    },
  }
);

export function DentistLanding() {
  const [bookingOpen, setBookingOpen] = useState(false);

  return (
    <div className="dentist-page relative min-h-screen overflow-hidden font-sans text-teal-950">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 30h60M30 0v60' stroke='%230d9488' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
        }}
        aria-hidden
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-16 pt-10 sm:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/30 pb-6 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-900/90 text-sm font-bold text-white shadow-md"
              aria-hidden
            >
              RD
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-800/80">
                Riverside Dental
              </p>
              <p className="text-lg font-semibold tracking-tight text-teal-950">
                Family &amp; cosmetic care
              </p>
            </div>
          </div>
          <nav className="text-sm text-teal-800/90" aria-label="Placeholder navigation">
            <span className="rounded-full bg-white/30 px-3 py-1">Hours</span>
            <span className="ml-2 rounded-full bg-white/30 px-3 py-1">Contact</span>
          </nav>
        </header>

        <main className="mt-12 flex flex-1 flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl rounded-3xl border border-white/40 bg-white/25 p-8 shadow-lg backdrop-blur-md">
            <h1 className="text-3xl font-semibold leading-tight text-teal-950 sm:text-4xl">
              Healthy smiles, calm visits.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-teal-900/85">
              This page is a generic dentist placeholder for the push-notification
              prototype. Services, team photos, and reviews would live here in a
              full product.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-teal-900/80">
              <li>• Routine cleanings &amp; exams</li>
              <li>• Restorative &amp; cosmetic options</li>
              <li>• Same-week availability (demo)</li>
            </ul>
          </div>

          <aside className="w-full max-w-sm rounded-3xl border border-white/40 bg-teal-900/15 p-6 shadow-lg backdrop-blur-md lg:mt-0">
            <p className="text-sm font-medium text-teal-900">Need a slot?</p>
            <p className="mt-1 text-xs text-teal-800/80">
              Opens the real booking flow (doctors from API, fixed demo patient).
            </p>
            <button
              type="button"
              onClick={() => {
                if (process.env.NODE_ENV === "development") {
                  console.debug("[dentist-landing] open booking modal");
                }
                setBookingOpen(true);
              }}
              className="mt-5 w-full rounded-full bg-teal-900 py-3 text-center text-sm font-semibold text-white shadow-md transition hover:bg-teal-950"
            >
              Book appointment
            </button>
          </aside>
        </main>

        <footer className="mt-auto border-t border-white/25 pt-8 text-center text-xs text-teal-800/70">
          Prototype UI — not a real practice. API:{" "}
          <code className="rounded bg-white/40 px-1">NEXT_PUBLIC_API_BASE_URL</code>
        </footer>
      </div>

      {bookingOpen && (
        <BookingModal onClose={() => setBookingOpen(false)} />
      )}
    </div>
  );
}
