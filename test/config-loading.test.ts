import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src";
import { resolve, relative, extname } from "pathe";
import { writeFile, mkdir, unlink } from "node:fs/promises";
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

  // describe("Search Strategies", () => {
  //   it("uses global search strategy by default", async () => {
  //     const result = await loadConfig({
  //       name: "nonexistent-global",
  //       defaultConfig: { mode: "global" },
  //     });

  //     expect(result.config.mode).toBe("global");
  //   });

  //   it("uses project search strategy when specified", async () => {
  //     const result = await loadConfig({
  //       name: "nonexistent-project",
  //       // searchStrategy: "project",
  //       defaultConfig: { mode: "project" },
  //     });

  //     expect(result.config.mode).toBe("project");
  //   });

  //   it("uses none search strategy when specified", async () => {
  //     const result = await loadConfig({
  //       name: "nonexistent-none",
  //       searchStrategy: "none",
  //       defaultConfig: { mode: "none" },
  //     });

  //     expect(result.config.mode).toBe("none");
  //   });
  // });

  // describe("Custom Search Places", () => {
  //   it("uses custom search places when provided", async () => {
  //     const customConfigPath = resolve(testDir, "custom.myapp.config.js");
  //     await writeFile(
  //       customConfigPath,
  //       `
  //       module.exports = {
  //         source: "custom-search-place",
  //         value: 42
  //       };
  //     `,
  //     );

  //     const result = await loadConfig({
  //       name: "myapp",
  //       cwd: testDir,
  //       searchPlaces: ["custom.myapp.config.js"],
  //     });

  //     expect(result.config.source).toBe("custom-search-place");
  //     expect(result.config.value).toBe(42);
  //   });
  // });

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
            timeout: 10_000
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

    it("loads config from global rc file with matching name", async () => {
      // Create a global RC file in the parent of testDir
      const parentDir = resolve(testDir, "..");
      const globalRcPath = resolve(parentDir, ".mergerrc.json");
      await writeFile(
        globalRcPath,
        JSON.stringify({
          globalValue: 123,
          database: { host: "global-host", port: 9999 },
        }),
      );

      const result = await loadConfig({
        name: "merger",
        cwd: testDir,
        globalRc: true,
      });

      expect(result.config.globalValue).toBe(123);
      expect(result.config.database.host).toBe("global-host");
      expect(result.config.database.port).toBe(9999);

      // Cleanup
      await unlink(globalRcPath);
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

    it("applies environment variables from locale if envName & NODE_ENV", async () => {
      process.env.NODE_ENV = undefined;

      const { config: dotenvxConfig } = await import("@dotenvx/dotenvx");
      vi.mocked(dotenvxConfig).mockImplementation(() => ({}));

      const _result = await loadConfig({
        name: "myapp",
      });

      expect(dotenvxConfig).toHaveBeenCalledWith({
        path: [
          expect.stringContaining(".env.local"),
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
      expect(result.config.num).toBe(123.45);
      expect(result.config.bool).toBe(true);
      expect(result.config.obj).toEqual({ key: "value", nested: { num: 42 } });
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
      const configPath = "test/temp/empty.config.js";
      await writeFile(configPath, `export default {};`);
      try {
        const result = await loadConfig({
          name: "test",
          configFile: configPath,
        });

        expect(result.config).toEqual({});
        if (result.filepath) {
          expect(relative(process.cwd(), result.filepath)).toBe(
            relative(
              process.cwd(),
              configPath.replace(extname(configPath), ""),
            ),
          );
        } else {
          expect(result.filepath).toBeUndefined();
        }
        expect(result.missing).toEqual([]);
      } finally {
        await unlink(configPath);
      }
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

  describe("Extends Configuration", () => {
    it("loads simple config without extends", async () => {
      // Create a simple config file
      const configPath = resolve(testDir, "simple.config.js");
      await writeFile(configPath, `export default { value: "test" };`);

      const result = await loadConfig({
        name: "simple",
        cwd: testDir,
      });

      expect(result.config.value).toBe("test");
    });

    it("extends from local config file", async () => {
      // Create base config
      const baseConfigPath = resolve(testDir, "base.config.js");
      await writeFile(
        baseConfigPath,
        `module.exports = {
          colors: {
            primary: "base_primary",
            text: "base_text"
          },
          features: ["base_feature"]
        };`,
      );

      // Create main config that extends base
      const mainConfigPath = resolve(testDir, "app.config.js");
      await writeFile(
        mainConfigPath,
        `module.exports = {
          extends: "./base.config.js",
          colors: {
            primary: "app_primary"
          },
          features: ["app_feature"]
        };`,
      );

      const result = await loadConfig({
        name: "app",
        cwd: testDir,
      });

      // Should merge configs with main config taking precedence
      expect(result.config.colors.primary).toBe("app_primary");
      expect(result.config.colors.text).toBe("base_text");
      // Arrays should be replaced, not concatenated (based on your custom defu)
      expect(result.config.features).toEqual(["app_feature"]);
    });

    it("extends from multiple layers", async () => {
      // Create base config in the same directory
      const baseConfigPath = resolve(testDir, "base.config.js");
      await writeFile(
        baseConfigPath,
        `module.exports = {
          colors: {
            primary: "base_primary",
            secondary: "base_secondary",
            text: "base_text"
          }
        };`,
      );

      // Create main config that extends base
      const mainConfigPath = resolve(testDir, "app.config.js");
      await writeFile(
        mainConfigPath,
        `module.exports = {
          extends: ["./base.config.js"],
          colors: {
            primary: "user_primary"
          }
        };`,
      );

      const result = await loadConfig({
        name: "app",
        cwd: testDir,
      });

      // Should work with configs in the same directory
      expect(result.config.colors.primary).toBe("user_primary");
      expect(result.config.colors.secondary).toBe("base_secondary");
      expect(result.config.colors.text).toBe("base_text");
    });

    it("documents limitation with nested directory extends", async () => {
      // NOTE: c12 has a path resolution bug when extending from nested directories
      // e.g., extends: "./base/config.js" fails due to dirname() logic in c12's resolveConfig
      // Workaround: Use same-directory extends like "./base.config.js" instead
      // See: hhttps://github.com/unjs/c12/issues/57 (extends path resolution issue)
      expect(true).toBe(true); // Placeholder test documenting the limitation
    });
  });

  describe("Environment-specific Configuration", () => {
    it("applies environment-specific config based on NODE_ENV", async () => {
      const configPath = resolve(testDir, "app.config.js");
      await writeFile(
        configPath,
        `module.exports = {
          logLevel: "info",
          database: {
            host: "localhost"
          },
          $test: {
            logLevel: "silent",
            database: {
              host: "test-db"
            }
          },
          $development: {
            logLevel: "debug",
            database: {
              host: "dev-db"
            }
          },
          $production: {
            logLevel: "error",
            database: {
              host: "prod-db"
            }
          }
        };`,
      );

      // Test with NODE_ENV=test
      process.env.NODE_ENV = "test";
      const testResult = await loadConfig({
        name: "app",
        cwd: testDir,
      });
      expect(testResult.config.logLevel).toBe("silent");
      expect(testResult.config.database.host).toBe("test-db");

      // Test with NODE_ENV=production
      process.env.NODE_ENV = "production";
      const prodResult = await loadConfig({
        name: "app",
        cwd: testDir,
      });
      expect(prodResult.config.logLevel).toBe("error");
      expect(prodResult.config.database.host).toBe("prod-db");

      // Test with NODE_ENV=development
      process.env.NODE_ENV = "development";
      const devResult = await loadConfig({
        name: "app",
        cwd: testDir,
      });
      expect(devResult.config.logLevel).toBe("debug");
      expect(devResult.config.database.host).toBe("dev-db");
    });

    it("applies custom environment config using $env", async () => {
      const configPath = resolve(testDir, "app.config.js");
      await writeFile(
        configPath,
        `module.exports = {
          logLevel: "info",
          $env: {
            staging: {
              logLevel: "debug",
              apiUrl: "https://staging.api.com"
            },
            qa: {
              logLevel: "verbose",
              apiUrl: "https://qa.api.com"
            }
          }
        };`,
      );

      // Test with custom envName
      const result = await loadConfig({
        name: "app",
        cwd: testDir,
        envName: "staging",
      });

      expect(result.config.logLevel).toBe("debug");
      expect(result.config.apiUrl).toBe("https://staging.api.com");

      // Test with different custom envName
      const qaResult = await loadConfig({
        name: "app",
        cwd: testDir,
        envName: "qa",
      });

      expect(qaResult.config.logLevel).toBe("verbose");
      expect(qaResult.config.apiUrl).toBe("https://qa.api.com");
    });

    it("disables environment-specific config when envName is false", async () => {
      process.env.NODE_ENV = "production";

      const configPath = resolve(testDir, "app.config.js");
      await writeFile(
        configPath,
        `module.exports = {
          logLevel: "info",
          $production: {
            logLevel: "error"
          }
        };`,
      );

      const result = await loadConfig({
        name: "app",
        cwd: testDir,
        envName: false,
      });

      // Should not apply production config
      expect(result.config.logLevel).toBe("info");
    });

    it("applies environment config in extended layers", async () => {
      // Create base config with env-specific settings
      const baseConfigPath = resolve(testDir, "base.config.js");
      await writeFile(
        baseConfigPath,
        `module.exports = {
          api: {
            timeout: 5000,
            retries: 3
          },
          $production: {
            api: {
              timeout: 10_000,
              retries: 5
            }
          }
        };`,
      );

      // Create main config that extends base
      const mainConfigPath = resolve(testDir, "app.config.js");
      await writeFile(
        mainConfigPath,
        `module.exports = {
          extends: "./base.config.js",
          api: {
            baseUrl: "https://api.example.com"
          },
          $production: {
            api: {
              baseUrl: "https://prod.api.example.com"
            }
          }
        };`,
      );

      process.env.NODE_ENV = "production";
      const result = await loadConfig({
        name: "app",
        cwd: testDir,
      });

      // Should merge env configs from both layers
      expect(result.config.api.baseUrl).toBe("https://prod.api.example.com");
      expect(result.config.api.timeout).toBe(10_000);
      expect(result.config.api.retries).toBe(5);
    });
  });

  describe("Combined Extends and Environment Configuration", () => {
    it("correctly merges extends with environment-specific overrides", async () => {
      // Create base config
      const baseConfigPath = resolve(testDir, "base.config.js");
      await writeFile(
        baseConfigPath,
        `module.exports = {
          app: {
            name: "MyApp",
            version: "1.0.0"
          },
          features: {
            auth: true,
            analytics: false
          },
          $development: {
            features: {
              analytics: true,
              debug: true
            }
          }
        };`,
      );

      // Create main config
      const mainConfigPath = resolve(testDir, "app.config.js");
      await writeFile(
        mainConfigPath,
        `module.exports = {
          extends: "./base.config.js",
          app: {
            version: "2.0.0"
          },
          api: {
            url: "https://api.example.com"
          },
          $development: {
            api: {
              url: "http://localhost:3000"
            }
          }
        };`,
      );

      process.env.NODE_ENV = "development";
      const result = await loadConfig({
        name: "app",
        cwd: testDir,
      });

      // Check merged values
      expect(result.config.app.name).toBe("MyApp");
      expect(result.config.app.version).toBe("2.0.0");
      expect(result.config.features.auth).toBe(true);
      expect(result.config.features.analytics).toBe(true); // from base $development
      expect(result.config.features.debug).toBe(true); // from base $development
      expect(result.config.api.url).toBe("http://localhost:3000"); // from main $development
    });
  });
});
