import type { Metadata } from "next";

import BondYields from "./BondYields";
import "./styles.css";

export const metadata: Metadata = {
  title: "Intro to Bond Yields · Greg Lewis",
  description:
    "The 10-year Treasury and the Fed's rate since 2000, with fifteen episodes explained, and the five ideas "
    + "that account for every turn, written for an econ 101 reader.",
};

export default function Page() {
  return <BondYields />;
}
