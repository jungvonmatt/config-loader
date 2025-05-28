import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src";
import { resolve } from "pathe";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

// Mock external dependencies
vi.mock("enquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock("@dotenvx/dotenvx", () => ({
  config: vi.fn(),
}));

describe("Config Loading", () => {
  const originalEnv = process.env;
  const testDir = resolve(process.cwd(), "test", "temp");

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    // Create temp directory for test configs
    if (!existsSync(testDir)) {
      await mkdir(testDir, { recursive: true });
    }
  });

  afterEach(async () => {
    process.env = originalEnv;

    // Clean up temp directory recursively
    try {
      if (existsSync(testDir)) {
        const { rm } = await import("node:fs/promises");
        await rm(testDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Configuration File Loading", () => {
    it("loads configuration from .js config file", async () => {
      const configPath = resolve(testDir, "myapp.config.js");
      await writeFile(
        configPath,
        `
        export default {
          database: {
            host: "localhost",
            port: 5432
          },
          api: {
            timeout: 30_000
          }
        };
      `,
      );

      const result = await loadConfig({
        name: "myapp",
        cwd: testDir,
      });

      expect(result.config.database.host).toBe("localhost");
      expect(result.config.database.port).toBe(5432);
      expect(result.config.api.timeout).toBe(30_000);
      expect(result.filepath).toBe(configPath);
      expect(result.isEmpty).toBe(false);
    });

    it("loads configuration from .ts config file", async () => {
      const configPath = resolve(testDir, "myapp.config.ts");
      await writeFile(
        configPath,
        `
        interface Config {
          database: {
            host: string;
            port: number;
          };
          features: string[];
        }

        const config: Config = {
          database: {
            host: "prod-db",
            port: 3306
          },
          features: ["auth", "logging", "metrics"]
        };

        export default config;
      `,
      );

      const result = await loadConfig({
        name: "myapp",
        cwd: testDir,
        defaultConfig: {
          database: { host: "localhost", port: 5432 },
          features: ["base"],
        },
      });

      expect(result.config.database.host).toBe("prod-db");
      expect(result.config.features).toEqual(["auth", "logging", "metrics"]);
    });

    it("loads configuration from .json config file", async () => {
      const configPath = resolve(testDir, ".myapprc.json");
      await writeFile(
        configPath,
        JSON.stringify({
          environment: "test",
          debug: true,
          services: {
            redis: {
              host: "redis-server",
              port: 6379,
            },
          },
        }),
      );

      const result = await loadConfig({
        name: "myapp",
        cwd: testDir,
      });

      expect(result.config.environment).toBe("test");
      expect(result.config.debug).toBe(true);
      expect(result.config.services.redis.host).toBe("redis-server");
    });

    it("handles configuration file that exports function", async () => {
      const configPath = resolve(testDir, "function.config.js");
      await writeFile(
        configPath,
        `
        export default function() {
          return {
            environment: "production",
            computed: {
              value: 2 + 2
            },
            timestamp: Date.now()
          };
        }
      `,
      );

      const result = await loadConfig({
        name: "function",
        cwd: testDir,
      });

      expect(result.config.environment).toBe("production");
      expect(result.config.computed.value).toBe(4);
      expect(typeof result.config.timestamp).toBe("number");
    });
  });

  describe("Search Strategies", () => {
    it("uses global search strategy by default", async () => {
      const result = await loadConfig({
        name: "nonexistent-global",
        defaultConfig: { mode: "global" },
      });

      expect(result.config.mode).toBe("global");
      expect(result.isEmpty).toBe(false);
    });

    it("uses project search strategy when specified", async () => {
      const result = await loadConfig({
        name: "nonexistent-project",
        searchStrategy: "project",
        defaultConfig: { mode: "project" },
      });

      expect(result.config.mode).toBe("project");
      expect(result.isEmpty).toBe(false);
    });

    it("uses none search strategy when specified", async () => {
      const result = await loadConfig({
        name: "nonexistent-none",
        searchStrategy: "none",
        defaultConfig: { mode: "none" },
      });

      expect(result.config.mode).toBe("none");
      expect(result.isEmpty).toBe(false);
    });
  });

  describe("Custom Search Places", () => {
    it("uses custom search places when provided", async () => {
      const customConfigPath = resolve(testDir, "custom.myapp.config.js");
      await writeFile(
        customConfigPath,
        `
        module.exports = {
          source: "custom-search-place",
          value: 42
        };
      `,
      );

      const result = await loadConfig({
        name: "myapp",
        cwd: testDir,
        searchPlaces: ["custom.myapp.config.js"],
      });

      expect(result.config.source).toBe("custom-search-place");
      expect(result.config.value).toBe(42);
    });
  });

  describe("Configuration Merging", () => {
    it("merges multiple configuration sources in correct order", async () => {
      const moduleConfigPath = resolve(testDir, "merger.config.js");
      await writeFile(
        moduleConfigPath,
        `
        export default {
          database: {
            host: "module-host",
            port: 5432,
            ssl: false
          },
          api: {
            version: "v1",
            timeout: 5000
          }
        };
      `,
      );

      const extraConfigPath = resolve(testDir, "extra.config.js");
      await writeFile(
        extraConfigPath,
        `
        export default {
          database: {
            host: "extra-host",
            ssl: true
          },
          api: {
            timeout: 10000
          },
          cache: {
            enabled: true
          }
        };
      `,
      );

      const result = await loadConfig({
        name: "merger",
        cwd: testDir,
        configFile: extraConfigPath,
        defaultConfig: {
          database: {
            host: "default-host",
            port: 3306,
            ssl: false,
            pool: 10,
          },
          logging: true,
        },
        overrides: {
          database: {
            host: "override-host",
          },
        },
      });

      // Test precedence: overrides > extraConfig > moduleConfig > defaultConfig
      expect(result.config.database.host).toBe("override-host");
      expect(result.config.database.ssl).toBe(true);
      expect(result.config.database.port).toBe(5432);
      expect(result.config.database.pool).toBe(10);
      expect(result.config.cache.enabled).toBe(true);
      expect(result.config.logging).toBe(true);
    });

    it("handles deep merging of nested objects", async () => {
      const result = await loadConfig({
        name: "deepmerge",
        defaultConfig: {
          level1: {
            level2: {
              level3: {
                value1: "default",
                value2: "default",
                value3: "default",
              },
            },
          },
        },
        overrides: {
          level1: {
            level2: {
              level3: {
                value1: "override",
              },
            },
          },
        },
      });

      expect(result.config.level1.level2.level3.value1).toBe("override");
      expect(result.config.level1.level2.level3.value2).toBe("default");
      expect(result.config.level1.level2.level3.value3).toBe("default");
    });
  });

  describe("Environment Variable Integration", () => {
    it("applies environment variables with custom envName", async () => {
      process.env.NODE_ENV = "production";

      const { config: dotenvxConfig } = await import("@dotenvx/dotenvx");
      vi.mocked(dotenvxConfig).mockImplementation(() => ({}));

      const _result = await loadConfig({
        name: "myapp",
        envName: "staging",
        defaultConfig: { env: "default" },
      });

      expect(dotenvxConfig).toHaveBeenCalledWith({
        path: [
          expect.stringContaining(".env.staging"),
          expect.stringContaining(".env"),
        ],
        ignore: ["MISSING_ENV_FILE"],
        quiet: true,
      });
    });

    it("disables environment loading when envName is false", async () => {
      const { config: dotenvxConfig } = await import("@dotenvx/dotenvx");

      const _result = await loadConfig({
        name: "myapp",
        envName: false,
        defaultConfig: { test: true },
      });

      expect(dotenvxConfig).toHaveBeenCalledWith({
        path: [expect.stringContaining(".env")],
        ignore: ["MISSING_ENV_FILE"],
        quiet: true,
      });
    });

    it("applies envMap correctly with different data types", async () => {
      process.env.STRING_VAR = "hello world";
      process.env.NUMBER_VAR = "123.45";
      process.env.BOOLEAN_VAR = "true";
      process.env.JSON_VAR = '{"key": "value", "nested": {"num": 42}}';

      const result = await loadConfig({
        name: "types",
        defaultConfig: {
          str: "",
          num: 0,
          bool: false,
          obj: {},
        },
        envMap: {
          STRING_VAR: "str",
          NUMBER_VAR: "num",
          BOOLEAN_VAR: "bool",
          JSON_VAR: "obj",
        },
      });

      expect(result.config.str).toBe("hello world");
      expect(result.config.num).toBe("123.45");
      expect(result.config.bool).toBe("true");
      expect(result.config.obj).toBe('{"key": "value", "nested": {"num": 42}}');
    });
  });

  describe("Error Handling", () => {
    it("handles invalid config file gracefully", async () => {
      const invalidConfigPath = resolve(testDir, "invalid.config.js");
      await writeFile(
        invalidConfigPath,
        `
        // This is invalid JavaScript
        export default {
          unclosed: "string
          invalid: syntax
        };
      `,
      );

      await expect(
        loadConfig({
          name: "invalid",
          configFile: invalidConfigPath,
        }),
      ).rejects.toThrow();
    });

    it("handles missing config file gracefully", async () => {
      const configPath = resolve(testDir, "nonexistent.config.js");

      // This should throw an error since we're explicitly trying to load a missing file
      await expect(
        loadConfig({
          name: "missing",
          configFile: configPath,
        }),
      ).rejects.toThrow("Config file");
    });
  });

  describe("Advanced Configuration", () => {
    it("handles custom working directory", async () => {
      const customDir = resolve(testDir, "custom");
      await mkdir(customDir, { recursive: true });
      const configPath = resolve(customDir, "myapp.config.js");
      await writeFile(
        configPath,
        `
        module.exports = {
          location: "custom-directory"
        };
      `,
      );

      const result = await loadConfig({
        name: "myapp",
        cwd: customDir,
      });

      expect(result.config.location).toBe("custom-directory");
    });

    it("handles empty configuration object", async () => {
      const configPath = resolve(testDir, "empty.config.js");
      await writeFile(configPath, `export default {};`);

      const result = await loadConfig({
        name: "empty",
        configFile: configPath,
      });

      expect(result.config).toEqual({});
      expect(result.isEmpty).toBe(false);
    });

    it("handles configuration with null and undefined values", async () => {
      const configPath = resolve(testDir, "nullish.config.js");
      await writeFile(
        configPath,
        `
        export default {
          nullable: undefined,
          undefinedValue: undefined,
          falsyButValid: false,
          zeroValue: 0,
          emptyString: ""
        };
      `,
      );

      const result = await loadConfig({
        name: "nullish",
        configFile: configPath,
        defaultConfig: {
          nullable: "default",
          undefinedValue: "default",
          falsyButValid: true,
          zeroValue: 100,
          emptyString: "default",
        },
      });

      expect(result.config.nullable).toBe("default");
      expect(result.config.undefinedValue).toBe("default");
      expect(result.config.falsyButValid).toBe(false);
      expect(result.config.zeroValue).toBe(0);
      expect(result.config.emptyString).toBe("");
    });
  });
});
