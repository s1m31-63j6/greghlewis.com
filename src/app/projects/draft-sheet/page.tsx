import type { Metadata } from "next";

import { DraftSheet } from "./DraftSheet";
import "./styles.css";

export const metadata: Metadata = {
  title: "A Draft Board for the Casual Fan — Fantasy Football · Greg Lewis",
  description:
    "Expert consensus tiers for your exact league settings, ADP from Yahoo, ESPN, "
    + "Sleeper and mock drafts side by side, offseason movement, and a printable "
    + "one-page sheet for draft day.",
};

export default function Page() {
  return <DraftSheet />;
}
