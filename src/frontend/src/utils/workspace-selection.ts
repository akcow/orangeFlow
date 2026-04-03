export type WorkspaceScope = "personal" | "team";

export const WORKSPACE_SCOPE_KEY = "lf_workspace_scope";
export const LAST_TEAM_FOLDER_ID_KEY = "lf_last_team_folder_id";
export const CURRENT_TEAM_ID_KEY = "mock_current_team_id";

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getStoredWorkspaceScope(): WorkspaceScope {
  if (!canUseLocalStorage()) {
    return "personal";
  }
  return window.localStorage.getItem(WORKSPACE_SCOPE_KEY) === "team"
    ? "team"
    : "personal";
}

export function getStoredLastTeamFolderId(): string {
  if (!canUseLocalStorage()) {
    return "";
  }
  return window.localStorage.getItem(LAST_TEAM_FOLDER_ID_KEY) || "";
}

export function getStoredCurrentTeamId(): string {
  if (!canUseLocalStorage()) {
    return "";
  }
  return window.localStorage.getItem(CURRENT_TEAM_ID_KEY) || "";
}

export function syncWorkspaceSelection(
  scope: WorkspaceScope,
  folderId?: string | null,
) {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(WORKSPACE_SCOPE_KEY, scope);

  if (scope === "team") {
    if (folderId) {
      window.localStorage.setItem(LAST_TEAM_FOLDER_ID_KEY, folderId);
      window.localStorage.setItem(CURRENT_TEAM_ID_KEY, folderId);
    } else {
      window.localStorage.removeItem(CURRENT_TEAM_ID_KEY);
    }
    return;
  }

  window.localStorage.removeItem(CURRENT_TEAM_ID_KEY);
}
