// Refresh token functionality tests

// Mock all dependencies before imports
const mockSetSessionStorage = jest.fn();
const mockSetAccessToken = jest.fn();
const mockAuthState = { autoLogin: false as boolean | null | undefined };
let mockIsAutoLoginEnv = true;
let mockMutateOptions: { retry?: number } | undefined;

jest.mock("@/constants/constants", () => ({
  get IS_AUTO_LOGIN() {
    return mockIsAutoLoginEnv;
  },
  LANGFLOW_ACCESS_TOKEN: "access_token_lf",
}));

jest.mock("@/utils/session-storage-util", () => ({
  setSessionStorage: (...args) => mockSetSessionStorage(...args),
}));

jest.mock(
  "@/stores/authStore",
  () =>
    Object.assign(
      jest.fn((selector) =>
        selector ? selector(mockAuthState) : false,
      ),
      {
        getState: () => ({
          setAccessToken: mockSetAccessToken,
        }),
      },
    ),
);

jest.mock("@/controllers/API/api", () => ({
  api: {
    post: jest.fn(),
  },
}));

jest.mock("@/controllers/API/services/request-processor", () => ({
  UseRequestProcessor: jest.fn(() => ({
    mutate: jest.fn((key, fn, options) => {
      mockMutateOptions = options;
      return {
        mutate: async () => {
          return await fn();
        },
      };
    }),
  })),
}));

import { useRefreshAccessToken } from "../use-post-refresh-access";

const mockApiPost = require("@/controllers/API/api").api.post;

describe("refresh token functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.autoLogin = false;
    mockIsAutoLoginEnv = true;
    mockMutateOptions = undefined;
  });

  describe("successful token refresh", () => {
    it("should call refresh API and update the in-memory/session token", async () => {
      const mockRefreshResponse = {
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        token_type: "bearer",
      };

      mockApiPost.mockResolvedValue({ data: mockRefreshResponse });

      const refreshMutation = useRefreshAccessToken();
      const result = await refreshMutation.mutate();

      expect(mockApiPost).toHaveBeenCalledWith(
        expect.stringContaining("refresh"),
      );
      expect(mockSetAccessToken).toHaveBeenCalledWith("new-access-token");
      expect(mockSetSessionStorage).toHaveBeenCalledWith(
        "access_token_lf",
        "new-access-token",
      );
      expect(result).toEqual(mockRefreshResponse);
    });

    it("should return the refresh response data", async () => {
      const mockRefreshResponse = {
        access_token: "new-access-token-123",
        refresh_token: "new-refresh-token-456",
        token_type: "bearer",
      };

      mockApiPost.mockResolvedValue({ data: mockRefreshResponse });

      const refreshMutation = useRefreshAccessToken();
      const result = await refreshMutation.mutate();

      expect(result).toEqual(mockRefreshResponse);
    });
  });

  describe("error handling", () => {
    it("should throw error when refresh API fails", async () => {
      const mockError = new Error("Refresh failed");
      mockApiPost.mockRejectedValue(mockError);

      const refreshMutation = useRefreshAccessToken();
      await expect(refreshMutation.mutate()).rejects.toThrow("Refresh failed");
    });

    it("should not set cookie when API fails", async () => {
      const mockError = new Error("API Error");
      mockApiPost.mockRejectedValue(mockError);

      const refreshMutation = useRefreshAccessToken();

      try {
        await refreshMutation.mutate();
      } catch (_error) {
        // Expected to throw
      }

      expect(mockSetSessionStorage).not.toHaveBeenCalled();
      expect(mockSetAccessToken).not.toHaveBeenCalled();
    });
  });

  describe("access token storage", () => {
    it("should update access token storage after refresh", async () => {
      const mockRefreshResponse = {
        access_token: "access-token",
        refresh_token: "refresh-token-xyz",
        token_type: "bearer",
      };

      mockApiPost.mockResolvedValue({ data: mockRefreshResponse });

      const refreshMutation = useRefreshAccessToken();
      await refreshMutation.mutate();

      expect(mockSetAccessToken).toHaveBeenCalledTimes(1);
      expect(mockSetAccessToken).toHaveBeenCalledWith("access-token");
      expect(mockSetSessionStorage).toHaveBeenCalledWith(
        "access_token_lf",
        "access-token",
      );
    });

    it("should persist refreshed access token before returning response", async () => {
      const mockRefreshResponse = {
        access_token: "access-token",
        refresh_token: "refresh-token-abc",
        token_type: "bearer",
      };

      mockApiPost.mockResolvedValue({ data: mockRefreshResponse });

      const refreshMutation = useRefreshAccessToken();
      const response = await refreshMutation.mutate();

      expect(mockSetAccessToken).toHaveBeenCalledWith("access-token");
      expect(mockSetSessionStorage).toHaveBeenCalledWith(
        "access_token_lf",
        "access-token",
      );
      expect(response).toEqual(mockRefreshResponse);
    });
  });

  describe("retry policy", () => {
    it("should honor explicit manual-login state over auto-login env", () => {
      mockAuthState.autoLogin = false;
      mockIsAutoLoginEnv = true;
      mockMutateOptions = undefined;
      jest.resetModules();

      jest.isolateModules(() => {
        const {
          useRefreshAccessToken: isolatedUseRefreshAccessToken,
        } = require("../use-post-refresh-access");
        isolatedUseRefreshAccessToken();
      });

      expect(mockMutateOptions?.retry).toBe(2);
    });

    it("should fall back to env when store state is undefined", () => {
      mockAuthState.autoLogin = undefined;
      mockIsAutoLoginEnv = true;
      mockMutateOptions = undefined;
      jest.resetModules();

      jest.isolateModules(() => {
        const {
          useRefreshAccessToken: isolatedUseRefreshAccessToken,
        } = require("../use-post-refresh-access");
        isolatedUseRefreshAccessToken();
      });

      expect(mockMutateOptions?.retry).toBe(0);
    });
  });
});
