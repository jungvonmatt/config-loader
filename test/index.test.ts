import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src";

// Mock external dependencies
vi.mock("enquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock("@dotenvx/dotenvx", () => ({
  config: vi.fn(),
}));

vi.mock("std-env", () => ({
  hasTTY: true, // Default to true for most tests
}));

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads config with default values when no config file exists", async () => {
    const result = await loadConfig({
      name: "nonexistent",
      defaultConfig: { foo: "bar", nested: { value: 42 } },
    });

    expect(result.config).toEqual({ foo: "bar", nested: { value: 42 } });
    expect(result.isEmpty).toBe(false);
    expect(result.missing).toEqual([]);
  });

  it("applies environment variables using envMap", async () => {
    process.env.DATABASE_URL = "postgres://localhost";
    process.env.API_KEY = "secret123";

    const result = await loadConfig({
      name: "test",
      // defaultConfig: { database: "", api: "" },
      envMap: {
        DATABASE_URL: "database",
        API_KEY: "api",
      },
    });

    expect(result.config.database).toBe("postgres://localhost");
    expect(result.config.api).toBe("secret123");
    expect(result.missing).toEqual([]);
  });

  it("applies environment variables using prefix pattern", async () => {
    process.env.TEST_CONFIG_DATABASE_HOST = "localhost";
    process.env.TEST_CONFIG_DATABASE_PORT = "5432";
    process.env.TEST_CONFIG_API_TIMEOUT = "30_000";

    const result = await loadConfig({
      name: "test",
      defaultConfig: {
        database: { host: "", port: 0 },
        api: { timeout: 0 },
      },
      overrides: {
        test: 1,
      },
    });

    expect(result.config.database.host).toBe("localhost");
    expect(result.config.database.port).toBe(5432);
    expect(result.config.api.timeout).toBe("30_000");
    expect(result.missing).toEqual([]);
  });

  it("skips dotenv loading when dotenv option is false", async () => {
    const { config: dotenvxConfig } = await import("@dotenvx/dotenvx");

    const result = await loadConfig({
      name: "test",
      defaultConfig: {},
      dotenv: false,
    });

    expect(dotenvxConfig).not.toHaveBeenCalled();
    expect(result.missing).toEqual([]);
  });

  it("prompts for missing required fields", async () => {
    const enquirer = await import("enquirer");
    const mockPrompt = vi.mocked(enquirer.default.prompt);
    mockPrompt.mockResolvedValue({
      apiKey: "prompted-key",
      database: "prompted-db",
    });

    const result = await loadConfig({
      name: "test",
      defaultConfig: { existing: "value" },
      required: ["apiKey", "database"],
    });

    expect(result.config.existing).toBe("value");

    expect(mockPrompt).toHaveBeenCalledWith([
      {
        name: "apiKey",
        type: "input",
        message: 'Please specify value for "apiKey"',
      },
      {
        name: "database",
        type: "input",
        message: 'Please specify value for "database"',
      },
    ]);

    expect(result.config).toEqual({
      existing: "value",
      apiKey: "prompted-key",
      database: "prompted-db",
    });
    expect(result.missing).toEqual(["apiKey", "database"]);
  });

  it("applies configuration in correct precedence order", async () => {
    process.env.TEST_CONFIG_VALUE = "env-value";

    const result = await loadConfig({
      name: "test",
      defaultConfig: { value: "default" },
      overrides: { value: "override" },
    });

    // Overrides should have highest precedence
    expect(result.config.value).toBe("override");
    expect(result.missing).toEqual([]);
  });

  it("handles empty configuration gracefully", async () => {
    const result = await loadConfig({
      name: "test",
    });

    expect(result.config).toEqual({});
    expect(result.missing).toEqual([]);
  });

  it("handles complex nested configuration merging", async () => {
    process.env.TEST_CONFIG_NESTED_DEEP_VALUE = "env-deep";

    const result = await loadConfig({
      name: "test",
      defaultConfig: {
        nested: {
          shallow: "default-shallow",
          deep: { value: "default-deep" },
        },
      },
    });

    expect(result.config.nested.shallow).toBe("default-shallow");
    expect(result.config.nested.deep.value).toBe("env-deep");
    expect(result.missing).toEqual([]);
  });
});
