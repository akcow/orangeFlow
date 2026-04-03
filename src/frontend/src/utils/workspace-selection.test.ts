import {
  CURRENT_TEAM_ID_KEY,
  LAST_TEAM_FOLDER_ID_KEY,
  WORKSPACE_SCOPE_KEY,
  getStoredCurrentTeamId,
  getStoredLastTeamFolderId,
  getStoredWorkspaceScope,
  syncWorkspaceSelection,
} from "./workspace-selection";

describe("workspace selection", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores the active team before navigation", () => {
    syncWorkspaceSelection("team", "team-2");

    expect(window.localStorage.getItem(WORKSPACE_SCOPE_KEY)).toBe("team");
    expect(window.localStorage.getItem(LAST_TEAM_FOLDER_ID_KEY)).toBe("team-2");
    expect(window.localStorage.getItem(CURRENT_TEAM_ID_KEY)).toBe("team-2");
    expect(getStoredWorkspaceScope()).toBe("team");
    expect(getStoredLastTeamFolderId()).toBe("team-2");
    expect(getStoredCurrentTeamId()).toBe("team-2");
  });

  it("switches back to personal without discarding the last team", () => {
    syncWorkspaceSelection("team", "team-9");
    syncWorkspaceSelection("personal");

    expect(window.localStorage.getItem(WORKSPACE_SCOPE_KEY)).toBe("personal");
    expect(window.localStorage.getItem(LAST_TEAM_FOLDER_ID_KEY)).toBe("team-9");
    expect(window.localStorage.getItem(CURRENT_TEAM_ID_KEY)).toBeNull();
    expect(getStoredWorkspaceScope()).toBe("personal");
    expect(getStoredLastTeamFolderId()).toBe("team-9");
    expect(getStoredCurrentTeamId()).toBe("");
  });
});
