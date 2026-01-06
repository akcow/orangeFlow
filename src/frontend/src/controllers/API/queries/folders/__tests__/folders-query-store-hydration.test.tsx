import { renderHook, waitFor } from "@testing-library/react";
import { useFolderStore } from "@/stores/foldersStore";
import { useGetFolderQuery } from "../use-get-folder";
import { useGetFoldersQuery } from "../use-get-folders";

const mockQuery = jest.fn();

jest.mock("@/controllers/API/services/request-processor", () => ({
  UseRequestProcessor: jest.fn(() => ({
    query: mockQuery,
  })),
}));

jest.mock("@/stores/authStore", () => {
  const mockStore = jest.fn((selector: any) =>
    selector({ isAuthenticated: true }),
  ) as any;
  mockStore.getState = jest.fn(() => ({ isAuthenticated: true }));
  return mockStore;
});

jest.mock("@/stores/utilityStore", () => ({
  useUtilityStore: (selector: any) =>
    selector({ defaultFolderName: "Starter Project" }),
}));

describe("folders queries store hydration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useFolderStore.getState().resetStore();
  });

  it("hydrates folders store from query data", async () => {
    const folders = [
      {
        id: "starter",
        name: "Starter Project",
        description: "",
        parent_id: "",
        flows: [],
        components: [],
      },
      {
        id: "p2",
        name: "My Project",
        description: "",
        parent_id: "",
        flows: [],
        components: [],
      },
    ];

    mockQuery.mockReturnValueOnce({ data: folders });

    renderHook(() => useGetFoldersQuery());

    await waitFor(() => {
      expect(useFolderStore.getState().folders).toEqual(folders);
      expect(useFolderStore.getState().myCollectionId).toBe("starter");
    });
  });

  it("disables folder query when id is missing", () => {
    mockQuery.mockReturnValueOnce({ data: undefined });

    renderHook(() => useGetFolderQuery({ id: "" }));

    const options = mockQuery.mock.calls[0]?.[2];
    expect(options.enabled).toBe(false);
  });
});

