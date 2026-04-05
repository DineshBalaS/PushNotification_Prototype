"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, createAppointment, fetchDoctors, type DoctorListItem } from "@/lib/api";
import { getBookingPatientId } from "@/lib/booking-config";

type CalendarCell = {
  label: number;
  inCurrentMonth: boolean;
  date: Date;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthGrid(viewMonth: Date): CalendarCell[] {
  const first = startOfMonth(viewMonth);
  const startWeekday = first.getDay();
  const year = first.getFullYear();
  const month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];
  const lead = new Date(year, month, 1 - startWeekday);
  for (let i = 0; i < startWeekday; i++) {
    const d = new Date(lead);
    d.setDate(lead.getDate() + i);
    cells.push({
      label: d.getDate(),
      inCurrentMonth: false,
      date: d,
    });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      label: day,
      inCurrentMonth: true,
      date: new Date(year, month, day),
    });
  }
  const tail = 42 - cells.length;
  for (let i = 1; i <= tail; i++) {
    const d = new Date(year, month + 1, i);
    cells.push({
      label: d.getDate(),
      inCurrentMonth: false,
      date: d,
    });
  }
  return cells;
}

function toAppointmentIsoUtc(localDate: Date, timeHHMM: string): string {
  const [hStr, mStr] = timeHHMM.split(":");
  const h = parseInt(hStr, 10);
  const min = parseInt(mStr, 10);
  const d = new Date(
    localDate.getFullYear(),
    localDate.getMonth(),
    localDate.getDate(),
    h,
    min,
    0,
    0
  );
  return d.toISOString();
}

/** 15-minute bookable slots, 08:00–17:45 (typical clinic window). */
function buildClinicalTimeSlots(): string[] {
  const out: string[] = [];
  for (let h = 8; h <= 17; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 17 && m > 45) {
        break;
      }
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

function formatSlotLabel(hhmm: string): string {
  const [hs, ms] = hhmm.split(":");
  const h = parseInt(hs, 10);
  const min = parseInt(ms, 10);
  const ref = new Date(2000, 0, 1, h, min, 0, 0);
  return ref.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function slotHour(hhmm: string): number {
  return parseInt(hhmm.slice(0, 2), 10);
}

const CLINICAL_TIME_SLOTS = buildClinicalTimeSlots();

export type BookingModalProps = {
  /** Parent mounts this component only when the dialog should be visible. */
  onClose: () => void;
};

export default function BookingModal({ onClose }: BookingModalProps) {
  const [doctors, setDoctors] = useState<DoctorListItem[] | null>(null);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctorsError, setDoctorsError] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slotTime, setSlotTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const monthLabel = useMemo(
    () =>
      viewMonth.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [viewMonth]
  );

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const morningSlots = useMemo(
    () => CLINICAL_TIME_SLOTS.filter((s) => slotHour(s) < 12),
    []
  );
  const afternoonSlots = useMemo(
    () => CLINICAL_TIME_SLOTS.filter((s) => slotHour(s) >= 12),
    []
  );

  useEffect(() => {
    setSlotTime("");
  }, [selectedDate]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.debug("[booking-modal] mounted");
    }
    let cancelled = false;
    setDoctorsLoading(true);
    setDoctorsError(null);
    fetchDoctors()
      .then((list) => {
        if (cancelled) {
          return;
        }
        setDoctors(list);
        if (process.env.NODE_ENV === "development") {
          console.debug("[booking-modal] doctors loaded count=%s", list.length);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) {
          return;
        }
        const msg = e instanceof ApiError ? e.message : "Could not load doctors.";
        setDoctorsError(msg);
        setDoctors([]);
        console.error("[booking-modal] fetchDoctors failed", e);
      })
      .finally(() => {
        if (!cancelled) {
          setDoctorsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit =
    Boolean(doctorId) &&
    selectedDate !== null &&
    /^\d{2}:\d{2}$/.test(slotTime) &&
    !submitting &&
    !doctorsLoading &&
    submitSuccess === null;

  const handleSubmit = async () => {
    if (!canSubmit || !doctorId || !selectedDate) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrorCode(null);
    setSubmitSuccess(null);
    try {
      const patient_id = getBookingPatientId();
      const appointment_time = toAppointmentIsoUtc(selectedDate, slotTime);
      if (process.env.NODE_ENV === "development") {
        console.debug("[booking-modal] submit", {
          patient_id,
          doctor_id: doctorId,
          appointment_time,
        });
      }
      const res = await createAppointment({
        patient_id,
        doctor_id: doctorId,
        appointment_time,
      });
      const novuLine =
        res.doctor_user_id != null && res.doctor_user_id !== ""
          ? `Doctor subscriber id (Novu): ${res.doctor_user_id}.`
          : "Doctor subscriber id not stored — add user_id on the doctor document for Novu.";
      setSubmitSuccess(
        `Booked — appointment id ${res.appointment_id}. ${novuLine}`
      );
      if (process.env.NODE_ENV === "development") {
        console.debug("[booking-modal] submit OK", res);
      }
    } catch (e: unknown) {
      let msg = "Booking failed.";
      let code: string | null = null;
      if (e instanceof ApiError) {
        msg = e.message;
        code = e.code ?? null;
      } else if (e instanceof Error) {
        msg = e.message;
      }
      setSubmitError(msg);
      setSubmitErrorCode(code);
      if (process.env.NODE_ENV === "development") {
        console.debug("[booking-modal] submit error code=%s message=%s", code, msg);
      }
      console.error("[booking-modal] submit failed", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="absolute inset-0 bg-teal-950/40 backdrop-blur-sm"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/40 bg-teal-50/80 p-6 shadow-xl backdrop-blur-md"
      >
        <h2
          id="booking-modal-title"
          className="text-lg font-semibold tracking-tight text-teal-950"
        >
          Book an appointment
        </h2>
        <p className="mt-1 text-sm text-teal-800/80">
          Prototype: patient is fixed via{" "}
          <code className="rounded bg-teal-100/80 px-1 text-xs">NEXT_PUBLIC_BOOKING_PATIENT_ID</code>
          .
        </p>

        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-teal-900/70">
            Doctor
          </h3>
          {doctorsLoading && (
            <p className="mt-2 text-sm text-teal-800">Loading doctors…</p>
          )}
          {doctorsError && (
            <p className="mt-2 text-sm text-red-700">{doctorsError}</p>
          )}
          {!doctorsLoading && doctors && doctors.length === 0 && !doctorsError && (
            <p className="mt-2 text-sm text-teal-800">No doctors available.</p>
          )}
          <ul className="mt-2 flex max-h-40 flex-col gap-2 overflow-y-auto">
            {doctors?.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-teal-200/60 bg-white/50 px-3 py-2 transition hover:bg-white/80">
                  <input
                    type="radio"
                    name="doctor"
                    value={d.id}
                    checked={doctorId === d.id}
                    onChange={() => setDoctorId(d.id)}
                    className="h-4 w-4 accent-teal-800"
                  />
                  <span className="text-sm text-teal-950">
                    <span className="font-medium">{d.name}</span>
                    <span className="block text-xs text-teal-800/80">
                      {d.specialty}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-teal-900/70">
              Date
            </h3>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
                className="rounded-lg px-2 py-1 text-sm text-teal-900 hover:bg-white/50"
                aria-label="Previous month"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="rounded-lg px-2 py-1 text-sm text-teal-900 hover:bg-white/50"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm font-medium text-teal-950">{monthLabel}</p>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-teal-800/70">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((cell, idx) => {
              const isSelected =
                selectedDate !== null && sameCalendarDay(selectedDate, cell.date);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!cell.inCurrentMonth}
                  onClick={() => {
                    if (cell.inCurrentMonth) {
                      setSelectedDate(cell.date);
                    }
                  }}
                  className={[
                    "flex h-9 items-center justify-center rounded-full text-sm transition",
                    !cell.inCurrentMonth
                      ? "cursor-default text-teal-300/50"
                      : "text-teal-950 hover:bg-white/60",
                    isSelected && cell.inCurrentMonth
                      ? "bg-teal-900 font-semibold text-white shadow-md hover:bg-teal-900"
                      : "",
                  ].join(" ")}
                >
                  {cell.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5" aria-labelledby="booking-time-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3
              id="booking-time-heading"
              className="text-xs font-semibold uppercase tracking-wide text-teal-900/70"
            >
              Available times
            </h3>
            <p className="text-[11px] text-teal-800/70">
              15-minute slots · your local timezone
            </p>
          </div>
          <div className="mt-2 rounded-2xl border border-teal-200/60 bg-white/55 p-3 shadow-inner">
            {!selectedDate ? (
              <p className="py-6 text-center text-sm text-teal-800/75">
                Select a date to see available times.
              </p>
            ) : (
              <div className="max-h-[min(14rem,40vh)] space-y-4 overflow-y-auto pr-1">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-teal-800/60">
                    Morning
                  </p>
                  <div
                    className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                    role="listbox"
                    aria-label="Morning appointment times"
                  >
                    {morningSlots.map((hhmm) => {
                      const selected = slotTime === hhmm;
                      return (
                        <button
                          key={hhmm}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => setSlotTime(hhmm)}
                          className={[
                            "rounded-xl border px-2 py-2.5 text-center text-xs font-medium transition",
                            selected
                              ? "border-teal-900 bg-teal-900 text-white shadow-md ring-2 ring-teal-900/25"
                              : "border-teal-200/70 bg-white/80 text-teal-900 hover:border-teal-500/50 hover:bg-white",
                          ].join(" ")}
                        >
                          {formatSlotLabel(hhmm)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="border-t border-teal-200/40 pt-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-teal-800/60">
                    Afternoon
                  </p>
                  <div
                    className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                    role="listbox"
                    aria-label="Afternoon appointment times"
                  >
                    {afternoonSlots.map((hhmm) => {
                      const selected = slotTime === hhmm;
                      return (
                        <button
                          key={hhmm}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => setSlotTime(hhmm)}
                          className={[
                            "rounded-xl border px-2 py-2.5 text-center text-xs font-medium transition",
                            selected
                              ? "border-teal-900 bg-teal-900 text-white shadow-md ring-2 ring-teal-900/25"
                              : "border-teal-200/70 bg-white/80 text-teal-900 hover:border-teal-500/50 hover:bg-white",
                          ].join(" ")}
                        >
                          {formatSlotLabel(hhmm)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          {selectedDate && slotTime !== "" && (
            <p className="mt-2 text-xs text-teal-800/80">
              Selected:{" "}
              <span className="font-medium text-teal-950">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {formatSlotLabel(slotTime)}
              </span>
            </p>
          )}
        </section>

        {submitError && (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {submitError}
            {submitErrorCode ? (
              <span className="mt-1 block font-mono text-xs text-red-600/90">
                Code: {submitErrorCode}
              </span>
            ) : null}
          </p>
        )}
        {submitSuccess && (
          <p className="mt-4 text-sm leading-relaxed text-teal-900" role="status">
            {submitSuccess}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-teal-700/30 px-5 py-2.5 text-sm font-medium text-teal-900 hover:bg-white/50"
          >
            Close
          </button>
          {submitSuccess ? (
            <button
              type="button"
              onClick={() => {
                setSubmitSuccess(null);
                setSubmitError(null);
                setSubmitErrorCode(null);
                setDoctorId(null);
                setSelectedDate(null);
                setSlotTime("");
                if (process.env.NODE_ENV === "development") {
                  console.debug("[booking-modal] book another — form reset");
                }
              }}
              className="rounded-full border border-teal-800/40 bg-white/60 px-5 py-2.5 text-sm font-semibold text-teal-950 hover:bg-white/90"
            >
              Book another
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            className="rounded-full bg-teal-900 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition enabled:hover:bg-teal-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Booking…" : "Confirm booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
