/**
 * Layout preferences for the app shell. The research-status rail can be expanded or collapsed to an
 * icon strip. Until the user chooses, it follows the screen: expanded on wide screens, collapsed on
 * laptop and tablet widths where the workspace needs the room.
 */

export const LG_MIN = 1024; // rail and dock appear as side and bottom bars from here up
export const XL_MIN = 1280; // full-width rail fits comfortably from here up
export const XXL_MIN = 1536; // rail and a docked evidence drawer fit side by side from here up

export type RailPref = "auto" | "expanded" | "collapsed";
export const RAIL_KEY = "sarvam-rail";

/** Anything other than an explicit choice means auto, so a corrupted value cannot break the UI. */
export function parseRailPref(raw: string | null | undefined): RailPref {
  return raw === "expanded" || raw === "collapsed" ? raw : "auto";
}

/**
 * Whether the rail is collapsed for a preference and a viewport width in CSS pixels. In auto mode
 * an open, docked evidence drawer also collapses it below xxl, so the workspace keeps its room.
 * An explicit choice always wins.
 */
export function isRailCollapsed(pref: RailPref, width: number, drawerDocked = false): boolean {
  if (pref === "collapsed") return true;
  if (pref === "expanded") return false;
  return width < XL_MIN || (drawerDocked && width < XXL_MIN);
}

export function readRailPref(): RailPref {
  try {
    return parseRailPref(localStorage.getItem(RAIL_KEY));
  } catch {
    return "auto"; // storage blocked
  }
}

export function writeRailPref(pref: RailPref): void {
  try {
    localStorage.setItem(RAIL_KEY, pref);
  } catch {
    // Storage unavailable: the choice still applies for this page view.
  }
}

/** The first number in a count label such as "3" or "2 open", for compact badges. */
export function countNumber(label: string | undefined): number | null {
  const m = label ? /\d+/.exec(label) : null;
  return m ? Number(m[0]) : null;
}
