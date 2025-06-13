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
  hasTTY: true, // Default to true, will be overridden in specific tests
}));

describe("Configuration Prompts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Required Fields", () => {
    it("prompts for single missing required field", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ apiKey: "user-provided-key" });

      const result = await loadConfig({
        name: "single-required",
        defaultConfig: { database: "localhost" },
        required: ["apiKey"],
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "apiKey",
          type: "input",
          message: 'Please specify value for "apiKey"',
        },
      ]);

      expect(result.config).toEqual({
        database: "localhost",
        apiKey: "user-provided-key",
      });
    });

    it("prompts for multiple missing required fields", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        username: "admin",
        password: "secret123",
        port: "3306",
      });

      const result = await loadConfig({
        name: "multi-required",
        defaultConfig: { host: "localhost" },
        required: ["username", "password", "port"],
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "username",
          type: "input",
          message: 'Please specify value for "username"',
        },
        {
          name: "password",
          type: "input",
          message: 'Please specify value for "password"',
        },
        {
          name: "port",
          type: "input",
          message: 'Please specify value for "port"',
        },
      ]);

      expect(result.config).toEqual({
        host: "localhost",
        username: "admin",
        password: "secret123",
        port: "3306",
      });
    });

    it("does not prompt for fields that already exist", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ missing: "prompted-value" });

      const result = await loadConfig({
        name: "partial-required",
        defaultConfig: {
          existing: "already-here",
          alsoThere: "present",
        },
        required: ["existing", "missing"],
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "missing",
          type: "input",
          message: 'Please specify value for "missing"',
        },
      ]);

      expect(result.config).toEqual({
        existing: "already-here",
        alsoThere: "present",
        missing: "prompted-value",
      });
    });

    it("skips prompting when no required fields are missing", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);

      const result = await loadConfig({
        name: "no-missing",
        defaultConfig: {
          field1: "value1",
          field2: "value2",
        },
        required: ["field1", "field2"],
      });

      // Should not prompt when all required fields are present
      expect(mockPrompt).not.toHaveBeenCalled();

      expect(result.config).toEqual({
        field1: "value1",
        field2: "value2",
      });
    });

    it("skips prompting when no required fields specified", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);

      const result = await loadConfig({
        name: "no-required",
        defaultConfig: { optional: "value" },
      });

      expect(mockPrompt).not.toHaveBeenCalled();
      expect(result.config).toEqual({ optional: "value" });
    });

    it("handles required fields with falsy but valid values", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);

      const result = await loadConfig({
        name: "falsy-valid",
        defaultConfig: {
          enableFeature: false, // falsy but valid
          maxRetries: 0, // falsy but valid
          emptyString: "", // falsy but valid
        },
        required: ["enableFeature", "maxRetries", "emptyString"],
      });

      // Should not prompt when all required fields are present (even if falsy)
      expect(mockPrompt).not.toHaveBeenCalled();

      expect(result.config.enableFeature).toBe(false);
      expect(result.config.maxRetries).toBe(0);
      expect(result.config.emptyString).toBe("");
    });

    it("prompts for fields with undefined values in config", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ undefinedField: "prompted-value" });

      const result = await loadConfig({
        name: "undefined-test",
        defaultConfig: {
          definedField: "value",
        },
        required: ["definedField", "undefinedField"],
      });

      // Should prompt for undefinedField since it's not in the config
      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "undefinedField",
          type: "input",
          message: 'Please specify value for "undefinedField"',
        },
      ]);

      expect(result.config).toEqual({
        definedField: "value",
        undefinedField: "prompted-value",
      });
    });
  });

  describe("Custom Prompts", () => {
    it("uses custom prompt configuration when provided as array", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        password: "secretpass",
        environment: "production",
      });

      const result = await loadConfig({
        name: "custom-prompts",
        defaultConfig: { app: "myapp" },
        required: ["password", "environment"],
        prompts: [
          {
            name: "password",
            type: "password",
            message: "Enter database password:",
          },
          {
            name: "environment",
            type: "select",
            message: "Select environment:",
            choices: ["development", "staging", "production"],
          },
        ],
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "password",
          type: "password",
          message: "Enter database password:",
        },
        {
          name: "environment",
          type: "select",
          message: "Select environment:",
          choices: ["development", "staging", "production"],
        },
      ]);

      expect(result.config).toEqual({
        app: "myapp",
        password: "secretpass",
        environment: "production",
      });
    });

    it("uses partial custom prompt configuration with fallbacks", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        username: "admin",
        apiKey: "custom-key",
      });

      const result = await loadConfig({
        name: "partial-custom",
        defaultConfig: {},
        required: ["username", "apiKey"],
        prompts: [
          {
            name: "username",
            type: "input",
            message: "Enter your username:",
            initial: "admin",
          },
          // apiKey not in prompts, should use fallback
        ],
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "username",
          type: "input",
          message: "Enter your username:",
          initial: "admin",
        },
        {
          name: "apiKey",
          type: "input",
          message: 'Please specify value for "apiKey"',
        },
      ]);

      expect(result.config).toEqual({
        username: "admin",
        apiKey: "custom-key",
      });
    });

    it("uses dynamic prompt configuration from function", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        port: "3000",
        ssl: "true",
      });

      const promptFunction = vi.fn().mockResolvedValue([
        {
          name: "port",
          type: "number",
          message: "Server port:",
          initial: 8080,
        },
        {
          name: "ssl",
          type: "confirm",
          message: "Enable SSL?",
          initial: false,
        },
      ]);

      const result = await loadConfig({
        name: "dynamic-prompts",
        defaultConfig: { host: "localhost" },
        required: ["port", "ssl"],
        prompts: promptFunction,
      });

      expect(promptFunction).toHaveBeenCalledWith({
        host: "localhost",
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "port",
          type: "number",
          message: "Server port:",
          initial: 8080,
        },
        {
          name: "ssl",
          type: "confirm",
          message: "Enable SSL?",
          initial: false,
        },
      ]);

      expect(result.config).toEqual({
        host: "localhost",
        port: "3000",
        ssl: "true",
      });
    });

    it("handles async prompt function", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ dbName: "production_db" });

      const asyncPromptFunction = vi.fn().mockImplementation(async (config) => {
        // Simulate async operation like API call or file read
        await new Promise((resolve) => setTimeout(resolve, 1));

        return [
          {
            name: "dbName",
            type: "input",
            message: `Database name for ${config.environment}:`,
            initial: `${config.environment}_db`,
          },
        ];
      });

      const result = await loadConfig({
        name: "async-prompts",
        defaultConfig: { environment: "prod" },
        required: ["dbName"],
        prompts: asyncPromptFunction,
      });

      expect(asyncPromptFunction).toHaveBeenCalledWith({
        environment: "prod",
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "dbName",
          type: "input",
          message: "Database name for prod:",
          initial: "prod_db",
        },
      ]);

      expect(result.config).toEqual({
        environment: "prod",
        dbName: "production_db",
      });
    });

    it("handles empty prompts function result", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ required: "fallback-value" });

      const emptyPromptFunction = vi.fn().mockResolvedValue([]);

      const result = await loadConfig({
        name: "empty-prompts",
        defaultConfig: {},
        required: ["required"],
        prompts: emptyPromptFunction,
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "required",
          type: "input",
          message: 'Please specify value for "required"',
        },
      ]);

      expect(result.config).toEqual({
        required: "fallback-value",
      });
    });

    it("handles prompts function returning undefined", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ required: "fallback-value" });

      const undefinedPromptFunction = vi.fn().mockResolvedValue(undefined);

      const result = await loadConfig({
        name: "undefined-prompts",
        defaultConfig: {},
        required: ["required"],
        prompts: undefinedPromptFunction,
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "required",
          type: "input",
          message: 'Please specify value for "required"',
        },
      ]);

      expect(result.config).toEqual({
        required: "fallback-value",
      });
    });
  });

  describe("Prompt Integration with Other Features", () => {
    it("prompts override environment variables and default config", async () => {
      // Don't set the env variable for the field we want to prompt for
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ password: "prompted-password" });

      const result = await loadConfig({
        name: "myapp",
        defaultConfig: { password: "default-password" },
        required: ["password"],
      });

      // Should not prompt since password is already in defaultConfig
      expect(mockPrompt).not.toHaveBeenCalled();

      expect(result.config.password).toBe("default-password");
    });

    it("respects overrides even when prompting", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ apiKey: "prompted-key" });

      const result = await loadConfig({
        name: "overrides-test",
        defaultConfig: {},
        required: ["apiKey", "username"],
        overrides: { username: "override-user" },
      });

      // Should only prompt for apiKey since username is in overrides
      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "apiKey",
          type: "input",
          message: 'Please specify value for "apiKey"',
        },
      ]);

      expect(result.config).toEqual({
        username: "override-user",
        apiKey: "prompted-key",
      });
    });

    it("prompts for fields missing from environment variables", async () => {
      process.env.API_TOKEN = "env-token";

      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ dbPassword: "prompted-password" } as any);

      const result = await loadConfig({
        name: "env-prompts",
        defaultConfig: {},
        envMap: {
          API_TOKEN: "apiToken",
        },
        required: ["apiToken", "dbPassword"],
      } as any);

      // Should only prompt for dbPassword since apiToken comes from env
      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "dbPassword",
          type: "input",
          message: 'Please specify value for "dbPassword"',
        },
      ]);

      expect(result.config).toEqual({
        apiToken: "env-token",
        dbPassword: "prompted-password",
      });
    });
  });

  describe("Edge Cases", () => {
    it("handles prompt errors gracefully", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockRejectedValue(new Error("User cancelled"));

      await expect(
        loadConfig({
          name: "error-test",
          defaultConfig: {},
          required: ["required"],
        }),
      ).rejects.toThrow("User cancelled");
    });
  });

  describe("TTY Detection", () => {
    beforeEach(() => {
      // Reset std-env mock before each test
      vi.resetModules();
    });

    it("prompts when TTY is available and required fields are missing", async () => {
      // Mock TTY as available
      vi.doMock("std-env", () => ({
        hasTTY: true,
      }));

      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ apiKey: "prompted-key" });

      // Reimport loadConfig to get fresh module with TTY=true
      const { loadConfig: freshLoadConfig } = await import("../src");

      const result = await freshLoadConfig({
        name: "tty-available",
        defaultConfig: {},
        required: ["apiKey"],
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "apiKey",
          type: "input",
          message: 'Please specify value for "apiKey"',
        },
      ]);

      expect(result.config).toEqual({
        apiKey: "prompted-key",
      });
      expect(result.missing).toEqual(["apiKey"]);
    });

    it("throws error when TTY is not available and required fields are missing", async () => {
      // Mock TTY as not available
      vi.doMock("std-env", () => ({
        hasTTY: false,
      }));

      // Reimport loadConfig to get fresh module with TTY=false
      const { loadConfig: freshLoadConfig } = await import("../src");

      await expect(
        freshLoadConfig({
          name: "no-tty",
          defaultConfig: {},
          required: ["apiKey", "dbPassword"],
        }),
      ).rejects.toThrow(
        "Configuration validation failed: Required fields are missing [apiKey, dbPassword]. " +
          "TTY is not available for interactive prompts. Please provide these values via environment variables or configuration files.",
      );
    });

    it("works normally when TTY is not available but no required fields are missing", async () => {
      // Mock TTY as not available
      vi.doMock("std-env", () => ({
        hasTTY: false,
      }));

      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);

      // Reimport loadConfig to get fresh module with TTY=false
      const { loadConfig: freshLoadConfig } = await import("../src");

      const result = await freshLoadConfig({
        name: "no-tty-complete",
        defaultConfig: {
          apiKey: "default-key",
          dbPassword: "default-password",
        },
        required: ["apiKey", "dbPassword"],
      });

      // Should not prompt at all
      expect(mockPrompt).not.toHaveBeenCalled();

      expect(result.config).toEqual({
        apiKey: "default-key",
        dbPassword: "default-password",
      });
      expect(result.missing).toEqual([]);
    });

    it("works normally when TTY is not available and no required fields specified", async () => {
      // Mock TTY as not available
      vi.doMock("std-env", () => ({
        hasTTY: false,
      }));

      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);

      // Reimport loadConfig to get fresh module with TTY=false
      const { loadConfig: freshLoadConfig } = await import("../src");

      const result = await freshLoadConfig({
        name: "no-tty-no-required",
        defaultConfig: {
          optional: "value",
        },
      });

      // Should not prompt at all
      expect(mockPrompt).not.toHaveBeenCalled();

      expect(result.config).toEqual({
        optional: "value",
      });
      expect(result.missing).toEqual([]);
    });

    it("throws specific error for single missing field when TTY unavailable", async () => {
      // Mock TTY as not available
      vi.doMock("std-env", () => ({
        hasTTY: false,
      }));

      // Reimport loadConfig to get fresh module with TTY=false
      const { loadConfig: freshLoadConfig } = await import("../src");

      await expect(
        freshLoadConfig({
          name: "single-missing",
          defaultConfig: { existing: "value" },
          required: ["apiKey"],
        }),
      ).rejects.toThrow(
        "Configuration validation failed: Required fields are missing [apiKey]. " +
          "TTY is not available for interactive prompts. Please provide these values via environment variables or configuration files.",
      );
    });
  });

  describe("Missing Fields Return Value", () => {
    it("returns empty missing array when no required fields specified", async () => {
      const result = await loadConfig({
        name: "no-required",
        defaultConfig: { optional: "value" },
      });

      expect(result.missing).toEqual([]);
    });

    it("returns empty missing array when all required fields are present", async () => {
      const result = await loadConfig({
        name: "all-present",
        defaultConfig: {
          field1: "value1",
          field2: "value2",
        },
        required: ["field1", "field2"],
      });

      expect(result.missing).toEqual([]);
    });

    it("returns missing fields after prompting fills them", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        missing1: "prompted1",
        missing2: "prompted2",
      });

      const result = await loadConfig({
        name: "prompt-missing",
        defaultConfig: { existing: "value" },
        required: ["existing", "missing1", "missing2"],
      });

      expect(result.missing).toEqual(["missing1", "missing2"]);
      expect(result.config).toEqual({
        existing: "value",
        missing1: "prompted1",
        missing2: "prompted2",
      });
    });
  });

  describe("Prompts Disabled", () => {
    it("throws error when prompts are disabled and required fields are missing", async () => {
      await expect(
        loadConfig({
          name: "prompts-disabled",
          defaultConfig: { existing: "value" },
          required: ["existing", "missing"],
          prompts: false,
        }),
      ).rejects.toThrow(
        "Configuration validation failed: Required fields are missing [missing]. " +
          "TTY is not available for interactive prompts. Please provide these values via environment variables or configuration files.",
      );
    });

    it("works normally when prompts are disabled but no required fields are missing", async () => {
      const result = await loadConfig({
        name: "prompts-disabled-complete",
        defaultConfig: {
          field1: "value1",
          field2: "value2",
        },
        required: ["field1", "field2"],
        prompts: false,
      });

      expect(result.config).toEqual({
        field1: "value1",
        field2: "value2",
      });
      expect(result.missing).toEqual([]);
    });

    it("throws error when prompts are disabled even with TTY available", async () => {
      // Mock TTY as available
      vi.doMock("std-env", () => ({
        hasTTY: true,
      }));

      // Reimport loadConfig to get fresh module with TTY=true
      const { loadConfig: freshLoadConfig } = await import("../src");

      await expect(
        freshLoadConfig({
          name: "prompts-disabled-tty",
          defaultConfig: {},
          required: ["missing"],
          prompts: false,
        }),
      ).rejects.toThrow(
        "Configuration validation failed: Required fields are missing [missing]. " +
          "TTY is not available for interactive prompts. Please provide these values via environment variables or configuration files.",
      );
    });
  });

  describe("Prompt Keys Sorting", () => {
    it("sorts promptKeys based on prompts order when prompts are provided", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        field3: "value3",
        field1: "value1",
        field2: "value2",
      });

      const result = await loadConfig({
        name: "sorted-prompts",
        defaultConfig: {},
        required: ["field1", "field2", "field3"],
        prompts: [
          {
            name: "field3",
            type: "input",
            message: "Field 3:",
          },
          {
            name: "field1",
            type: "input",
            message: "Field 1:",
          },
          {
            name: "field2",
            type: "input",
            message: "Field 2:",
          },
        ],
      });

      // Verify that prompt was called with prompts in the correct order
      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "field3",
          type: "input",
          message: "Field 3:",
        },
        {
          name: "field1",
          type: "input",
          message: "Field 1:",
        },
        {
          name: "field2",
          type: "input",
          message: "Field 2:",
        },
      ]);

      expect(result.config).toEqual({
        field3: "value3",
        field1: "value1",
        field2: "value2",
      });
    });

    it("maintains original order when no prompts are provided", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        field1: "value1",
        field2: "value2",
        field3: "value3",
      });

      const result = await loadConfig({
        name: "unsorted-prompts",
        defaultConfig: {},
        required: ["field1", "field2", "field3"],
      });

      // Verify that prompt was called with prompts in the original order
      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "field1",
          type: "input",
          message: 'Please specify value for "field1"',
        },
        {
          name: "field2",
          type: "input",
          message: 'Please specify value for "field2"',
        },
        {
          name: "field3",
          type: "input",
          message: 'Please specify value for "field3"',
        },
      ]);

      expect(result.config).toEqual({
        field1: "value1",
        field2: "value2",
        field3: "value3",
      });
    });

    it("sorts promptKeys based on prompts order and appends missing keys", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        field3: "value3",
        field1: "value1",
        field2: "value2",
        field4: "value4",
      });

      const result = await loadConfig({
        name: "mixed-prompts",
        defaultConfig: {},
        required: ["field1", "field2", "field3", "field4"],
        prompts: [
          {
            name: "field3",
            type: "input",
            message: "Field 3:",
          },
          {
            name: "field1",
            type: "input",
            message: "Field 1:",
          },
        ],
      });

      // Verify that prompt was called with prompts in the correct order
      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "field3",
          type: "input",
          message: "Field 3:",
        },
        {
          name: "field1",
          type: "input",
          message: "Field 1:",
        },
        {
          name: "field2",
          type: "input",
          message: 'Please specify value for "field2"',
        },
        {
          name: "field4",
          type: "input",
          message: 'Please specify value for "field4"',
        },
      ]);

      expect(result.config).toEqual({
        field3: "value3",
        field1: "value1",
        field2: "value2",
        field4: "value4",
      });
    });
  });

  describe("Function-based Required and Prompt", () => {
    it("handles function-based required option", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        dynamicField: "dynamic-value",
      });

      const requiredFn = vi.fn().mockResolvedValue(["dynamicField"]);

      const result = await loadConfig({
        name: "function-required",
        defaultConfig: { staticField: "static-value" },
        required: (_config) => requiredFn(_config),
      });

      expect(requiredFn).toHaveBeenCalledWith({
        staticField: "static-value",
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "dynamicField",
          type: "input",
          message: 'Please specify value for "dynamicField"',
        },
      ]);

      expect(result.config).toEqual({
        staticField: "static-value",
        dynamicField: "dynamic-value",
      });
    });

    it("handles function-based prompt option", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        dynamicPrompt: "prompted-value",
      });

      const promptFn = vi.fn().mockResolvedValue(["dynamicPrompt"]);

      const result = await loadConfig({
        name: "function-prompt",
        defaultConfig: { staticField: "static-value" },
        prompt: (_config) => promptFn(_config),
      });

      expect(promptFn).toHaveBeenCalledWith({
        staticField: "static-value",
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "dynamicPrompt",
          type: "input",
          message: 'Please specify value for "dynamicPrompt"',
        },
      ]);

      expect(result.config).toEqual({
        staticField: "static-value",
        dynamicPrompt: "prompted-value",
      });
    });

    it("handles async function-based required and prompt options", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        requiredField: "required-value",
        promptField: "prompted-value",
      });

      const requiredFn = vi.fn().mockImplementation(async (_config) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return ["requiredField"];
      });

      const promptFn = vi.fn().mockImplementation(async (_config) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return ["promptField"];
      });

      const result = await loadConfig({
        name: "async-functions",
        defaultConfig: { staticField: "static-value" },
        required: requiredFn,
        prompt: promptFn,
      });

      expect(requiredFn).toHaveBeenCalledWith({
        staticField: "static-value",
      });

      expect(promptFn).toHaveBeenCalledWith({
        staticField: "static-value",
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "requiredField",
          type: "input",
          message: 'Please specify value for "requiredField"',
        },
        {
          name: "promptField",
          type: "input",
          message: 'Please specify value for "promptField"',
        },
      ]);

      expect(result.config).toEqual({
        staticField: "static-value",
        requiredField: "required-value",
        promptField: "prompted-value",
      });
    });

    it("handles function-based required and prompt with custom prompts", async () => {
      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({
        requiredField: "required-value",
        promptField: "prompted-value",
      });

      const requiredFn = vi.fn().mockResolvedValue(["requiredField"]);
      const promptFn = vi.fn().mockResolvedValue(["promptField"]);

      const result = await loadConfig({
        name: "function-with-prompts",
        defaultConfig: { staticField: "static-value" },
        required: requiredFn,
        prompt: promptFn,
        prompts: [
          {
            name: "promptField",
            type: "input",
            message: "Custom prompt message:",
          },
          {
            name: "requiredField",
            type: "input",
            message: "Custom required message:",
          },
        ],
      });

      expect(requiredFn).toHaveBeenCalledWith({
        staticField: "static-value",
      });

      expect(promptFn).toHaveBeenCalledWith({
        staticField: "static-value",
      });

      expect(mockPrompt).toHaveBeenCalledWith([
        {
          name: "promptField",
          type: "input",
          message: "Custom prompt message:",
        },
        {
          name: "requiredField",
          type: "input",
          message: "Custom required message:",
        },
      ]);

      expect(result.config).toEqual({
        staticField: "static-value",
        requiredField: "required-value",
        promptField: "prompted-value",
      });
    });
  });
});
