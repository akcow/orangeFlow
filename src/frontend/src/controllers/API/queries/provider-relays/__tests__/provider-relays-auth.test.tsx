import { renderHook } from "@testing-library/react";

const authState = {
  isAuthenticated: false,
  isAdmin: false,
};

const mockQuery = jest.fn(() => ({ data: [], isLoading: false }));

jest.mock("@/stores/authStore", () => ({
  __esModule: true,
  default: (selector) => selector(authState),
}));

jest.mock("@/controllers/API/services/request-processor", () => ({
  UseRequestProcessor: () => ({
    query: mockQuery,
  }),
}));

jest.mock("@/controllers/API/api", () => ({
  api: {
    get: jest.fn(),
  },
}));

describe("provider relay admin queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authState.isAuthenticated = false;
    authState.isAdmin = false;
  });

  it("disables provider relay list requests for non-admin sessions", async () => {
    const { useGetProviderRelaysQuery } = await import("../use-get-provider-relays");

    renderHook(() => useGetProviderRelaysQuery());

    expect(mockQuery).toHaveBeenCalledWith(
      ["useGetProviderRelays"],
      expect.any(Function),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("enables provider relay list requests only for authenticated admins", async () => {
    authState.isAuthenticated = true;
    authState.isAdmin = true;

    const { useGetProviderRelaysQuery } = await import("../use-get-provider-relays");

    renderHook(() => useGetProviderRelaysQuery());

    expect(mockQuery).toHaveBeenCalledWith(
      ["useGetProviderRelays"],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("disables provider relay model catalog requests for non-admin sessions", async () => {
    const { useGetProviderRelayModelCatalogQuery } = await import(
      "../use-get-provider-relay-model-catalog"
    );

    renderHook(() => useGetProviderRelayModelCatalogQuery());

    expect(mockQuery).toHaveBeenCalledWith(
      ["useGetProviderRelayModelCatalog"],
      expect.any(Function),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("enables provider relay model catalog requests only for authenticated admins", async () => {
    authState.isAuthenticated = true;
    authState.isAdmin = true;

    const { useGetProviderRelayModelCatalogQuery } = await import(
      "../use-get-provider-relay-model-catalog"
    );

    renderHook(() => useGetProviderRelayModelCatalogQuery());

    expect(mockQuery).toHaveBeenCalledWith(
      ["useGetProviderRelayModelCatalog"],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );
  });
});
