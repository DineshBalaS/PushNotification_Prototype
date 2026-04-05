import type { Metadata } from "next";
import { DentistLanding } from "@/components/dentist-landing";

export const metadata: Metadata = {
  title: "Riverside Dental | Book a visit",
  description: "Prototype dentist landing with appointment booking.",
};

export default function Home() {
  return <DentistLanding />;
}
