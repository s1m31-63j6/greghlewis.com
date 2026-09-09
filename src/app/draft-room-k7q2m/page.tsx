import type { Metadata } from "next";

import { DraftRoom } from "./DraftRoom";
import "./styles.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Draft Room",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DraftRoom />;
}
