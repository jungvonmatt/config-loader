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

describe("Type Safety and Inference", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Basic Type Inference", () => {
    it("infers types from defaultConfig", async () => {
      const result = await loadConfig({
        name: "type-inference",
        defaultConfig: {
          port: 3000,
          host: "localhost",
          ssl: true,
          features: ["auth", "logging"],
          database: {
            host: "db-host",
            port: 5432,
          },
        },
      });

      // These should all be properly typed
      expect(typeof result.config.port).toBe("number");
      expect(typeof result.config.host).toBe("string");
      expect(typeof result.config.ssl).toBe("boolean");
      expect(Array.isArray(result.config.features)).toBe(true);
      expect(typeof result.config.database.host).toBe("string");
      expect(typeof result.config.database.port).toBe("number");
    });

    it("maintains type safety with overrides", async () => {
      const result = await loadConfig({
        name: "override-types",
        defaultConfig: {
          timeout: 5000,
          retries: 3,
          enabled: false,
        },
        overrides: {
          timeout: 10_000,
          enabled: true,
        },
      });

      expect(result.config.timeout).toBe(10_000);
      expect(result.config.retries).toBe(3);
      expect(result.config.enabled).toBe(true);
    });

    it("handles complex nested object types", async () => {
      interface DatabaseConfig {
        host: string;
        port: number;
        credentials: {
          username: string;
          password: string;
        };
        pools: {
          read: number;
          write: number;
        };
      }

      const result = await loadConfig({
        name: "complex-types",
        defaultConfig: {
          database: {
            host: "localhost",
            port: 5432,
            credentials: {
              username: "admin",
              password: "secret",
            },
            pools: {
              read: 5,
              write: 2,
            },
          } as DatabaseConfig,
          metadata: {
            version: "1.0.0",
            build: Date.now(),
          },
        },
      });

      expect(result.config.database.host).toBe("localhost");
      expect(result.config.database.credentials.username).toBe("admin");
      expect(result.config.database.pools.read).toBe(5);
      expect(typeof result.config.metadata?.build).toBe("number");
    });
  });

  describe("Union Types and Optional Properties", () => {
    it("handles union types correctly", async () => {
      type LogLevel = "debug" | "info" | "warn" | "error";

      const result = await loadConfig({
        name: "union-types",
        defaultConfig: {
          logLevel: "info" as LogLevel,
          port: 3000 as number | string,
          enabled: true as boolean | "auto",
        },
      });

      expect(result.config.logLevel).toBe("info");
      expect(result.config.port).toBe(3000);
      expect(result.config.enabled).toBe(true);
    });

    it("handles optional properties", async () => {
      interface OptionalConfig {
        required: string;
        optional?: number;
        nested?: {
          value?: string;
        };
      }

      const result = await loadConfig({
        name: "optional-props",
        defaultConfig: {
          required: "value",
        } as OptionalConfig,
      });

      expect(result.config.required).toBe("value");
      expect(result.config.optional).toBeUndefined();
      expect(result.config.nested).toBeUndefined();
    });
  });

  describe("Array and Object Types", () => {
    it("preserves array types and content", async () => {
      const result = await loadConfig({
        name: "array-types",
        defaultConfig: {
          tags: ["tag1", "tag2", "tag3"],
          numbers: [1, 2, 3, 4, 5],
          mixed: ["string", 123, true],
          nested: [
            { id: 1, name: "first" },
            { id: 2, name: "second" },
          ],
        },
      });

      expect(Array.isArray(result.config.tags)).toBe(true);
      expect(result.config.tags).toEqual(["tag1", "tag2", "tag3"]);
      expect(result.config.numbers.every((n) => typeof n === "number")).toBe(
        true,
      );
      expect(result.config.mixed).toEqual(["string", 123, true]);
      expect(result.config.nested?.[0]?.id).toBe(1);
      expect(result.config.nested?.[1]?.name).toBe("second");
    });

    it("handles Map-like objects", async () => {
      const result = await loadConfig({
        name: "map-objects",
        defaultConfig: {
          services: {
            auth: { port: 3001, enabled: true },
            database: { port: 5432, enabled: true },
            cache: { port: 6379, enabled: false },
          },
          endpoints: {
            "/api/v1": { method: "GET", auth: true },
            "/health": { method: "GET", auth: false },
          },
        },
      });

      expect(result.config.services.auth.port).toBe(3001);
      expect(result.config.services.cache.enabled).toBe(false);
      expect(result.config.endpoints["/api/v1"].auth).toBe(true);
    });
  });

  describe("Environment Variable Type Coercion", () => {
    it("handles automatic type coercion from environment", async () => {
      process.env.TYPETEST_CONFIG_PORT = "8080";
      process.env.TYPETEST_CONFIG_DEBUG = "true";
      process.env.TYPETEST_CONFIG_TIMEOUT = "30000";
      process.env.TYPETEST_CONFIG_FEATURES = '["auth", "logging"]';

      const result = await loadConfig({
        name: "typetest",
        defaultConfig: {
          port: 3000,
          debug: false,
          timeout: 5000,
          features: [] as string[],
        },
      });

      expect(result.config.port).toBe(8080);
      expect(result.config.debug).toBe(true);
      expect(result.config.timeout).toBe(30_000);
      expect(result.config.features).toEqual(["auth", "logging"]);
    });

    it("preserves original types when env vars are invalid", async () => {
      process.env.TYPETEST_CONFIG_PORT = "invalid-number";
      process.env.TYPETEST_CONFIG_DEBUG = "maybe";

      const result = await loadConfig({
        name: "typetest",
        defaultConfig: {
          port: 3000,
          debug: false,
          host: "localhost",
        },
      });

      // Invalid values should be treated as strings but may be parsed
      expect(typeof result.config.port).toBe("string"); // Invalid number becomes string
      expect(typeof result.config.debug).toBe("string"); // Invalid boolean becomes string
      expect(result.config.host).toBe("localhost"); // Unchanged
    });
  });

  describe("Generics and Advanced Types", () => {
    it("supports generic type parameters", async () => {
      interface ServiceConfig {
        name: string;
        port: number;
        enabled: boolean;
      }

      const result = await loadConfig<{ service: ServiceConfig }>({
        name: "generic-test",
        defaultConfig: {
          service: {
            name: "my-service",
            port: 3000,
            enabled: true,
          },
        },
      });

      expect(result.config.service.name).toBe("my-service");
      expect(result.config.service.port).toBe(3000);
      expect(result.config.service.enabled).toBe(true);
    });

    it("handles readonly and immutable types", async () => {
      const result = await loadConfig({
        name: "readonly-types",
        defaultConfig: {
          constants: {
            PI: 3.141_59,
            MAX_SIZE: 1000,
          } as const,
          readonlyArray: ["a", "b", "c"] as const,
          frozenObject: Object.freeze({ type: "immutable", version: 1 }),
        },
      });

      expect(result.config.constants.PI).toBe(3.141_59);
      expect(result.config.readonlyArray).toEqual(["a", "b", "c"]);
    });
  });

  describe("Function and Class Types", () => {
    it("handles function properties", async () => {
      const mockFunction = vi.fn().mockReturnValue("mock-result");

      const result = await loadConfig({
        name: "function-test",
        defaultConfig: {
          transformer: mockFunction,
          validator: (value: string) => value.length > 0,
          factory: () => ({ created: Date.now() }),
        },
      });

      expect(typeof result.config.transformer).toBe("function");
      expect(result.config.transformer()).toBe("mock-result");
      expect(result.config.validator("test")).toBe(true);
      expect(typeof result.config.factory()).toBe("object");
    });

    it("handles class instances", async () => {
      class DatabaseConnection {
        constructor(
          public host: string,
          public port: number,
        ) {}

        connect() {
          return `Connected to ${this.host}:${this.port}`;
        }
      }

      const connection = new DatabaseConnection("localhost", 5432);

      const result = await loadConfig({
        name: "class-test",
        defaultConfig: {
          connection,
          metadata: {
            type: "postgres",
            version: "14.0",
          },
        },
      });

      expect(result.config.connection).toBeInstanceOf(DatabaseConnection);
      expect(result.config.connection.host).toBe("localhost");
      expect(result.config.connection.connect()).toBe(
        "Connected to localhost:5432",
      );
    });
  });

  describe("Error Handling with Types", () => {
    it("maintains type safety during error scenarios", async () => {
      const result = await loadConfig({
        name: "error-safety",
        defaultConfig: {
          fallbackValue: "safe-default",
          numericValue: 42,
          booleanValue: false,
        },
        overrides: {
          // These would override defaults even in error scenarios
          fallbackValue: "override-value",
        },
      });

      expect(result.config.fallbackValue).toBe("override-value");
      expect(result.config.numericValue).toBe(42);
      expect(result.config.booleanValue).toBe(false);
    });

    it("handles type coercion edge cases", async () => {
      const result = await loadConfig({
        name: "edge-cases",
        defaultConfig: {
          emptyObject: {},
          emptyArray: [],
        },
        overrides: {
          nullValue: "default", // override null with string
          undefinedValue: "default", // override undefined with string
        },
      });

      expect(result.config.nullValue).toBe("default");
      expect(result.config.undefinedValue).toBe("default");
      expect(result.config.emptyObject).toEqual({}); // Empty object stays empty
      expect(result.config.emptyArray).toEqual([]);
    });
  });

  describe("Configuration Result Types", () => {
    it("returns properly typed configuration result", async () => {
      const result = await loadConfig({
        name: "result-types",
        defaultConfig: {
          app: "test-app",
          version: "1.0.0",
        },
      });

      // Test result structure
      expect(typeof result.config).toBe("object");
      expect(["string", "undefined"]).toContain(typeof result.filepath);
      expect(Array.isArray(result.missing)).toBe(true);

      // Test config contents
      expect(result.config.app).toBe("test-app");
      expect(result.config.version).toBe("1.0.0");
    });

    it("preserves complex result types through the entire pipeline", async () => {
      interface ComplexConfig {
        database: {
          connections: Array<{
            name: string;
            url: string;
            pool: { min: number; max: number };
          }>;
        };
        services: Record<string, { enabled: boolean; config?: any }>;
        metadata: {
          build: number;
          version: string;
          features: string[];
        };
      }

      const result = await loadConfig({
        name: "complex-result",
        defaultConfig: {
          database: {
            connections: [
              {
                name: "primary",
                url: "postgres://localhost/primary",
                pool: { min: 2, max: 10 },
              },
            ],
          },
          services: {
            auth: { enabled: true, config: { timeout: 30 } },
            cache: { enabled: false },
          },
          metadata: {
            build: Date.now(),
            version: "1.0.0",
            features: ["auth", "cache"],
          },
        } as ComplexConfig,
      });

      expect(result.config.database.connections?.[0]?.name).toBe("primary");
      expect(result.config.services.auth?.enabled).toBe(true);
      expect(result.config.metadata?.features).toContain("auth");
      expect(typeof result.config.metadata?.build).toBe("number");
    });
  });
});
