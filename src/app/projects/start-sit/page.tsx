import type { Metadata } from "next";

import { StartSit } from "./StartSit";
import "./styles.css";

export const metadata: Metadata = {
  title: "Start/Sit by the Betting Market — Fantasy Football · Greg Lewis",
  description:
    "Pick up to five players and let this week's prop lines decide. Sportsbook and "
    + "pick'em lines for receptions, yards and touchdowns become market-implied fantasy "
    + "points with a floor, a ceiling and a plain verdict.",
};

export default function Page() {
  return <StartSit />;
}
