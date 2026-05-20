import type { Metadata } from "next";
import ExitSimulator from "./ExitSimulator";
import "./styles.css";

export const metadata: Metadata = {
  title: "Sell now, or build to sell? · Greg Lewis",
  description:
    "An interactive scenario model for a founder-led services firm weighing a strategic sale three years out — sweeping organic growth, restructure lift, ramp duration, EBITDA margin and multiple.",
};

export default function Page() {
  return <ExitSimulator />;
}
