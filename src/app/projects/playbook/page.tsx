import type { Metadata } from "next";

import Playbook from "./Playbook";

export const metadata: Metadata = {
  title: "Playbook · Greg Lewis",
  description:
    "A searchable, editable book of football plays for 5-, 7-, and 11-man teams. "
    + "316 pre-built plays across eight offensive philosophies plus a 51-play defensive "
    + "library, an animated play designer, and printable call sheets and wristbands.",
};

export default function Page() {
  return <Playbook />;
}
