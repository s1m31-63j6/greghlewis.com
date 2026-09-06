import type { Metadata } from "next";

import CareerPaths from "./CareerPaths";
import "./styles.css";
import "./plinko.css";
import "./adventure.css";
import "./brief.css";

export const metadata: Metadata = {
  title: "Should You Join a Startup? · Greg Lewis",
  description:
    "Three thousand simulated careers, dropped one year at a time: what a first job at a startup, "
    + "a corporation, or a consulting firm tends to pay over thirty years, and what funding stage "
    + "does to the odds.",
};

export default function Page() {
  return <CareerPaths />;
}
