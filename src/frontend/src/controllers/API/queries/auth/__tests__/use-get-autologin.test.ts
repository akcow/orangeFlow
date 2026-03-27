jest.mock("../../../api", () => ({
  api: {
    get: jest.fn(),
  },
}));

import { api } from "../../../api";
import {
  isAutoLoginDisabledError,
  restoreManualSession,
} from "../use-get-autologin";

describe("isAutoLoginDisabledError", () => {
  it("should return true when the backend explicitly disables auto login", () => {
    expect(
      isAutoLoginDisabledError({
        response: {
          data: {
            detail: {
              auto_login: false,
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("should return false for unrelated API errors", () => {
    expect(
      isAutoLoginDisabledError({
        response: {
          data: {
            detail: {
              message: "something else",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("should return false for plain runtime errors", () => {
    expect(isAutoLoginDisabledError(new Error("network"))).toBe(false);
  });
});

describe("restoreManualSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should restore session from whoami when cookie-backed session exists", async () => {
    const mockUser = {
      id: "user-1",
      username: "test@example.com",
      is_superuser: false,
    };
    const onRestored = jest.fn();
    (api.get as jest.Mock).mockResolvedValue({ data: mockUser });

    const restored = await restoreManualSession(onRestored);

    expect(restored).toBe(true);
    expect(api.get).toHaveBeenCalledWith("/api/v1/users/whoami");
    expect(onRestored).toHaveBeenCalledWith(mockUser);
  });

  it("should return false when whoami cannot restore a session", async () => {
    const onRestored = jest.fn();
    (api.get as jest.Mock).mockRejectedValue(new Error("unauthorized"));

    const restored = await restoreManualSession(onRestored);

    expect(restored).toBe(false);
    expect(onRestored).not.toHaveBeenCalled();
  });
});
