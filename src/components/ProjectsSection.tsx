import type { StoredProject } from "../lib/projectsStore";

export type ProjectsSectionMode = "projects" | "views";

interface ProjectsSectionProps {
  projects: StoredProject[];
  mode: ProjectsSectionMode;
  /** Project whose views are listed (only relevant in "views" mode). */
  openProject: StoredProject | null;
  activeViewId: string | null;
  onOpenProject: (projectId: string) => void;
  /** ✕ next to the Views title — back to the Projects list. */
  onCloseProject: () => void;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onCreateView: () => void;
  onSelectView: (projectId: string, viewId: string) => void;
  onDeleteView: (projectId: string, viewId: string) => void;
}

const ROW_BASE =
  "w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between group";

/**
 * Bottom section of the sidebar. Shows either the list of saved projects or,
 * once a project is open, that project's saved views ("presaved SQL queries").
 */
export function ProjectsSection({
  projects,
  mode,
  openProject,
  activeViewId,
  onOpenProject,
  onCloseProject,
  onCreateProject,
  onDeleteProject,
  onCreateView,
  onSelectView,
  onDeleteView,
}: ProjectsSectionProps) {
  // Views mode: a project is open, so the Projects list is replaced by its views.
  if (mode === "views" && openProject) {
    return (
      <div className="shrink-0 border-t border-gray-700 flex flex-col max-h-[45%] min-h-0">
        <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-gray-700/60 shrink-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 shrink-0">
              Views
            </h2>
            <span className="text-[10px] text-gray-500 truncate">{openProject.name}</span>
          </div>
          <button
            onClick={onCloseProject}
            aria-label="Back to projects"
            title="Back to projects"
            className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors text-sm leading-none"
          >
            ×
          </button>
        </div>
        <div key={`views-${openProject.id}`} className="flex-1 overflow-y-auto min-h-0 fade-slide">
          {openProject.views.map((view) => {
            const active = activeViewId === view.id;
            return (
              <div
                key={view.id}
                className={`${ROW_BASE} ${
                  active
                    ? "bg-blue-600/20 text-blue-300"
                    : "hover:bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                <button
                  onClick={() => onSelectView(openProject.id, view.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  title={view.sql}
                >
                  <span className="text-xs opacity-50">🔎</span>
                  <span className="truncate text-xs">{view.name}</span>
                </button>
                <button
                  onClick={() => onDeleteView(openProject.id, view.id)}
                  title="Delete view"
                  aria-label={`Delete view ${view.name}`}
                  className="text-[10px] opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity px-1 py-0.5 rounded hover:bg-gray-700 shrink-0"
                >
                  🗑
                </button>
              </div>
            );
          })}
          {openProject.views.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-gray-600">No views yet</div>
          )}
        </div>
        <div className="p-2 border-t border-gray-700/60 shrink-0">
          <button
            onClick={onCreateView}
            className="w-full px-3 py-2 text-xs font-medium text-blue-300 bg-blue-600/20 hover:bg-blue-600/30 rounded transition-colors"
          >
            + Create view
          </button>
        </div>
      </div>
    );
  }

  // Projects mode (also the fallback while no project is open).
  return (
    <div className="shrink-0 border-t border-gray-700 flex flex-col max-h-[45%] min-h-0">
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-700/60 shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Projects ({projects.length})
        </h2>
        <button
          onClick={onCreateProject}
          aria-label="Create a project"
          title="Create a project"
          className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors text-sm leading-none"
        >
          +
        </button>
      </div>
      <div key="projects" className="flex-1 overflow-y-auto min-h-0 fade-slide">
        {projects.map((project) => (
          <div
            key={project.id}
            className={`${ROW_BASE} hover:bg-gray-800 text-gray-400 hover:text-gray-200`}
          >
            <button
              onClick={() => onOpenProject(project.id)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left"
            >
              <span className="text-xs opacity-50">📁</span>
              <span className="truncate text-xs">{project.name}</span>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] opacity-40 tabular-nums mr-1">
                {project.views.length}
              </span>
              <button
                onClick={() => onDeleteProject(project.id)}
                title="Delete project"
                aria-label={`Delete project ${project.name}`}
                className="text-[10px] opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity px-1 py-0.5 rounded hover:bg-gray-700"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-gray-600 mb-3">No projects yet</p>
            <button
              onClick={onCreateProject}
              className="px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-600/20 hover:bg-blue-600/30 rounded transition-colors"
            >
              Create a project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
