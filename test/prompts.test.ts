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
      mockPrompt.mockResolvedValue({}); // Return empty object for empty prompt

      const result = await loadConfig({
        name: "no-missing",
        defaultConfig: {
          field1: "value1",
          field2: "value2",
        },
        required: ["field1", "field2"],
      });

      // Even when no fields are missing, prompt gets called with empty array
      expect(mockPrompt).toHaveBeenCalledWith([]);

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
      mockPrompt.mockResolvedValue({}); // Return empty object for empty prompt

      const result = await loadConfig({
        name: "falsy-valid",
        defaultConfig: {
          enableFeature: false, // falsy but valid
          maxRetries: 0, // falsy but valid
          emptyString: "", // falsy but valid
        },
        required: ["enableFeature", "maxRetries", "emptyString"],
      });

      // Even when all required fields are present, prompt gets called with empty array
      expect(mockPrompt).toHaveBeenCalledWith([]);

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
      process.env.MYAPP_CONFIG_PASSWORD = "env-password";

      const enquirer = await import("enquirer");
      const mockPrompt = vi.mocked(enquirer.default.prompt);
      mockPrompt.mockResolvedValue({ password: "prompted-password" });

      const result = await loadConfig({
        name: "myapp",
        defaultConfig: { password: "default-password" },
        required: ["password"],
      });

      expect(result.config.password).toBe("prompted-password");
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
});
