import { getEnvVar, isEnvVarEnabled } from "../env";

describe("env utils", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BACKEND_URL;
    delete process.env.LANGFLOW_AUTO_LOGIN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should disable a feature when LANGFLOW_AUTO_LOGIN is false", () => {
    process.env.LANGFLOW_AUTO_LOGIN = "false";

    expect(isEnvVarEnabled("LANGFLOW_AUTO_LOGIN")).toBe(false);
  });

  it("should enable a feature by default when LANGFLOW_AUTO_LOGIN is unset", () => {
    expect(isEnvVarEnabled("LANGFLOW_AUTO_LOGIN")).toBe(true);
  });

  it("should prefer process env overrides when the key exists", () => {
    process.env.BACKEND_URL = "http://localhost:9999";

    expect(getEnvVar("BACKEND_URL")).toBe("http://localhost:9999");
  });
});
