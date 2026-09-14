/**
 * localStorage-backed storage for "projects" and their "views" (presaved SQL
 * queries). Data shape (all under one localStorage key, schema versioned):
 *
 *   { version: 1, projects: [{ id, name, createdAt, views: [{ id, name, sql, createdAt, updatedAt }] }] }
 *
 * Views always live inside their project; deleting a project deletes its views.
 */

export interface StoredView {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredProject {
  id: string;
  name: string;
  createdAt: number;
  views: StoredView[];
}

interface Store {
  version: 1;
  projects: StoredProject[];
}

const STORAGE_KEY = "slitex:projects";

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, projects: [] };
    const parsed = JSON.parse(raw) as Partial<Store>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.projects)) {
      return { version: 1, projects: [] };
    }
    // Defensively normalize each project (older/partial writes).
    const projects: StoredProject[] = [];
    for (const p of parsed.projects) {
      if (!p || typeof p.id !== "string" || typeof p.name !== "string") continue;
      projects.push({
        id: p.id,
        name: p.name,
        createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
        views: Array.isArray(p.views)
          ? p.views
              .filter((v) => v && typeof v.id === "string" && typeof v.name === "string" && typeof v.sql === "string")
              .map((v) => ({
                id: v.id,
                name: v.name,
                sql: v.sql,
                createdAt: typeof v.createdAt === "number" ? v.createdAt : Date.now(),
                updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : v.createdAt ?? Date.now(),
              }))
          : [],
      });
    }
    return { version: 1, projects };
  } catch {
    return { version: 1, projects: [] };
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error("Failed to persist projects to localStorage:", err);
  }
}

export function listProjects(): StoredProject[] {
  return readStore().projects;
}

export function createProject(name: string): StoredProject {
  const store = readStore();
  const project: StoredProject = { id: makeId(), name: name.trim(), createdAt: Date.now(), views: [] };
  store.projects.push(project);
  writeStore(store);
  return project;
}

export function deleteProject(projectId: string): void {
  const store = readStore();
  writeStore({ version: 1, projects: store.projects.filter((p) => p.id !== projectId) });
}

/** Find a project and one of its views; null when either no longer exists. */
export function findView(
  projectId: string | null,
  viewId: string | null
): { project: StoredProject; view: StoredView } | null {
  if (!projectId || !viewId) return null;
  const project = readStore().projects.find((p) => p.id === projectId);
  if (!project) return null;
  const view = project.views.find((v) => v.id === viewId);
  return view ? { project, view } : null;
}

/**
 * Create or update a view. Pass viewId=null to create. When updating, an empty
 * `name` keeps the stored name (SQL-only update); a non-empty name renames.
 * Returns the stored view.
 */
export function upsertView(
  projectId: string,
  viewId: string | null,
  name: string,
  sql: string
): StoredView {
  const store = readStore();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found");
  const now = Date.now();
  const trimmedName = name.trim();

  if (viewId != null) {
    const existing = project.views.find((v) => v.id === viewId);
    if (existing) {
      if (trimmedName) existing.name = trimmedName;
      existing.sql = sql;
      existing.updatedAt = now;
      writeStore(store);
      return { ...existing };
    }
  }
  const view: StoredView = { id: makeId(), name: trimmedName, sql, createdAt: now, updatedAt: now };
  project.views.push(view);
  writeStore(store);
  return view;
}

export function deleteView(projectId: string, viewId: string): void {
  const store = readStore();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) return;
  project.views = project.views.filter((v) => v.id !== viewId);
  writeStore(store);
}

/** Case-insensitive, trimmed duplicate check used by the name modal. */
export function projectNameExists(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  return listProjects().some((p) => p.name.toLowerCase() === trimmed);
}

/** Case-insensitive duplicate check within one project's views. */
export function viewNameExists(projectId: string, name: string, exceptViewId?: string): boolean {
  const trimmed = name.trim().toLowerCase();
  const project = listProjects().find((p) => p.id === projectId);
  if (!project) return false;
  return project.views.some((v) => v.id !== exceptViewId && v.name.toLowerCase() === trimmed);
}
