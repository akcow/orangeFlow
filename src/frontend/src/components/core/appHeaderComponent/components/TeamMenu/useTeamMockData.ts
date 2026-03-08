import { useState, useMemo, useEffect } from "react";
import { useFolderStore } from "@/stores/foldersStore";
import { usePostFolders } from "@/controllers/API/queries/folders/use-post-folders";
import useAlertStore from "@/stores/alertStore";

export type Role = "owner" | "admin" | "member";

export interface TeamMember {
    userId: string;
    name: string;
    email: string;
    avatar?: string;
    role: Role;
    isCurrentUser?: boolean;
}

export interface TeamQuota {
    type: string; // e.g., "FREE", "PRO"
    used: number;
    total: number | "infinity";
}

export interface Team {
    id: string;
    name: string;
    avatar?: string;
    members: TeamMember[];
    quota: TeamQuota;
    isDefault?: boolean;
}

const mockCurrentUser: TeamMember = {
    userId: "user_1",
    name: "akcow",
    email: "2653000784@qq.com",
    role: "owner",
    isCurrentUser: true,
};

function getMockTeamsFromStorage(): Record<string, Team> {
    const raw = localStorage.getItem("mock_teams_registry");
    if (raw) {
        try {
            const data = JSON.parse(raw);
            // 过滤旧的导致图片破损的 blob 死链
            Object.values(data).forEach((team: any) => {
                if (team.avatar && team.avatar.startsWith("blob:")) {
                    delete team.avatar;
                }
            });
            return data;
        } catch { return {}; }
    }
    return {};
}

function saveMockTeamsToStorage(registry: Record<string, Team>) {
    localStorage.setItem("mock_teams_registry", JSON.stringify(registry));
}

export function useTeamMockData() {
    const folders = useFolderStore((state) => state.folders) || [];
    const myCollectionId = useFolderStore((state) => state.myCollectionId);

    // Parse current folder ID from URL if explicitly in workspace
    const pathname = window.location.pathname;
    const isFolderRoute = pathname.includes("/folder/");
    const currentUrlFolderId = isFolderRoute ? pathname.split("/folder/")[1] : myCollectionId;

    const [teamsRegistry, setTeamsRegistry] = useState<Record<string, Team>>(getMockTeamsFromStorage());

    const { mutateAsync: addFolder } = usePostFolders();
    const setSuccessData = useAlertStore((state) => state.setSuccessData);
    const setErrorData = useAlertStore((state) => state.setErrorData);

    // Sync folders to mock teams
    useEffect(() => {
        if (!folders || folders.length === 0) return;

        const newRegistry = { ...teamsRegistry };
        let updated = false;

        folders.forEach((folder: any) => {
            if (!folder || !folder.id) return;
            const fid = folder.id as string;
            if (newRegistry[fid]) {
                if (newRegistry[fid].name !== folder.name) {
                    newRegistry[fid].name = folder.name;
                    updated = true;
                }
            } else {
                newRegistry[fid] = {
                    id: fid,
                    name: folder.name,
                    members: [{ ...mockCurrentUser, role: "owner" }],
                    quota: {
                        type: fid === myCollectionId ? "FREE" : "PRO",
                        used: 0,
                        total: "infinity",
                    },
                    isDefault: fid === myCollectionId,
                };
                updated = true;
            }
        });

        if (updated) {
            saveMockTeamsToStorage(newRegistry);
            setTeamsRegistry(newRegistry);
        }
    }, [folders, myCollectionId]);

    const activeTeamId = currentUrlFolderId || myCollectionId;

    const teams = useMemo(() => {
        return folders.map((f: any) => f?.id ? teamsRegistry[f.id] : null).filter(Boolean) as Team[];
    }, [folders, teamsRegistry]);

    const currentTeam = useMemo(() => {
        if (teams.length === 0 || !activeTeamId) {
            return {
                id: activeTeamId || "",
                name: "Loading...",
                members: [mockCurrentUser],
                quota: { type: "FREE", used: 0, total: "infinity" }
            } as Team;
        }
        return teams.find((t) => t.id === activeTeamId) || teams[0];
    }, [teams, activeTeamId]);

    const switchTeam = (id: string) => {
        if (!id) return;
        window.location.href = `/all/folder/${id}`;
    };

    const createTeam = async (name: string) => {
        if (!name) return;
        try {
            const newFolder = await addFolder({
                data: { name, description: "", components: [], flows: [] } as any
            });

            if (newFolder && (newFolder as any).id) {
                setSuccessData({ title: "团队创建成功" });
                window.location.href = `/all/folder/${(newFolder as any).id}`;
            }
        } catch (err: any) {
            setErrorData({ title: "创建失败", list: [err.message] });
        }
    };

    const updateMemberRole = (userId: string, newRole: Role) => {
        const registry = { ...teamsRegistry };
        const idToUpdate = currentTeam.id;
        if (idToUpdate && registry[idToUpdate]) {
            registry[idToUpdate] = {
                ...registry[idToUpdate],
                members: registry[idToUpdate].members.map((m: any) => m.userId === userId ? { ...m, role: newRole } : m)
            };
            saveMockTeamsToStorage(registry);
            setTeamsRegistry(registry);
        }
    };

    const updateTeamProfile = (name: string, avatarUrl: string | undefined) => {
        const registry = { ...teamsRegistry };
        const idToUpdate = currentTeam.id;
        if (idToUpdate && registry[idToUpdate]) {
            registry[idToUpdate] = {
                ...registry[idToUpdate],
                name,
                avatar: avatarUrl
            };
            saveMockTeamsToStorage(registry);
            setTeamsRegistry(registry);
        }
    };

    return {
        teams,
        currentTeam,
        currentTeamId: currentTeam.id,
        switchTeam,
        createTeam,
        updateMemberRole,
        updateTeamProfile,
    };
}
