import type { Metadata } from "next";
import EmbaSimulator from "./EmbaSimulator";
import "./styles.css";

export const metadata: Metadata = {
  title: "Is the EMBA Worth It? · Greg Lewis",
  description:
    "An interactive scenario calculator for the financial case for an Executive MBA. Sweep wage growth, market returns, savings discipline, and program cost over a 25-to-30-year horizon.",
};

export default function Page() {
  return <EmbaSimulator />;
}
