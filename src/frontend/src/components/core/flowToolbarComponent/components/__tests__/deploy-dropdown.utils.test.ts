import { getAvailableTeamProjects } from "../deploy-dropdown.utils";

describe("getAvailableTeamProjects", () => {
  it("keeps starter team projects returned by the teams API", () => {
    const result = getAvailableTeamProjects(
      [
        {
          id: "personal-folder",
          name: "My Collection",
          description: null,
          member_count: 1,
          current_user_role: "OWNER",
        },
        {
          id: "starter-folder",
          name: "Starter Projects",
          description: "starter team workspace",
          member_count: 2,
          current_user_role: "OWNER",
        },
        {
          id: "team-folder",
          name: "Design Team",
          description: null,
          member_count: 3,
          current_user_role: "MEMBER",
        },
      ],
      "personal-folder",
    );

    expect(result).toEqual([
      {
        id: "starter-folder",
        name: "Starter Projects",
        description: "starter team workspace",
      },
      {
        id: "team-folder",
        name: "Design Team",
        description: null,
      },
    ]);
  });
});
