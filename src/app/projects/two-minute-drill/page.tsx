import type { Metadata } from "next";

import Drill from "./Drill";

export const metadata: Metadata = {
  title: "Two-Minute Drill · Greg Lewis",
  description:
    "Play through 300 real NFL endgames. Take either sideline with under two minutes left and "
    + "a one-score game, and find out whether your calls beat the ones that were actually made.",
};

export default function Page() {
  return <Drill />;
}
