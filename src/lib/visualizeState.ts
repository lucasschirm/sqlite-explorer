// Cross-page handoff for the ERD view. The explorer captures the open
// database's schema when a file loads; /visualize reads it from here.
//
// Module state survives hash-route switches (explorer ↔ docs ↔ visualize) but
// not a full page reload — the visualize page shows its empty state then,
// mirroring how the explorer itself forgets the database on reload.
import type { TableInfo } from "../types";

export interface VisualizeDbState {
  /** Original file name, shown in the visualize header. */
  name: string | null;
  /**
   * Schema DDL (CREATE TABLE/VIEW/INDEX statements) generated from the open
   * database. The ERD component rebuilds its diagram from this SQL, so no
   * database bytes need to be re-parsed or re-fetched on the visualize page.
   */
  schemaSql: string | null;
  /** Table/view snapshot for quick validation of click targets. */
  tables: TableInfo[];
}

const state: VisualizeDbState = {
  name: null,
  schemaSql: null,
  tables: [],
};

/** Capture the currently open database so /visualize can render its ERD. */
export function setVisualizeDb(update: Partial<VisualizeDbState>): void {
  Object.assign(state, update);
}

/** Read the captured database (empty when nothing is open — e.g. after reload). */
export function getVisualizeDb(): VisualizeDbState {
  return { ...state };
}
