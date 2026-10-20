/** Identity of this paper: route id, number (from the index), and inks from palettes.json. */

import { paperNo } from "@/app/_landing/projects-data";
import palettes from "../../../../design/working-papers/palettes.json";

export const PROJECT = "bond-yields";
export const PAPER_NO = paperNo(PROJECT);
export const INKS = palettes.papers[PROJECT];
