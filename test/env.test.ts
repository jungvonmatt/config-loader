import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getEnv, applyEnv } from "../src/env";

describe("env utilities", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getEnv", () => {
    it("gets environment variable with prefix", () => {
      process.env.TEST_PREFIX_MY_VAR = "test-value";

      const result = getEnv("myVar", { prefix: "TEST_PREFIX_" });

      expect(result).toBe("test-value");
    });

    it("gets environment variable with altPrefix when prefix not found", () => {
      process.env.ALT_PREFIX_MY_VAR = "alt-value";

      const result = getEnv("myVar", {
        prefix: "TEST_PREFIX_",
        altPrefix: "ALT_PREFIX_",
      });

      expect(result).toBe("alt-value");
    });

    it("prefers prefix over altPrefix when both exist", () => {
      process.env.TEST_PREFIX_MY_VAR = "prefix-value";
      process.env.ALT_PREFIX_MY_VAR = "alt-value";

      const result = getEnv("myVar", {
        prefix: "TEST_PREFIX_",
        altPrefix: "ALT_PREFIX_",
      });

      expect(result).toBe("prefix-value");
    });

    it("converts camelCase to SNAKE_CASE", () => {
      process.env.TEST_PREFIX_CAMEL_CASE_VAR = "converted";

      const result = getEnv("camelCaseVar", { prefix: "TEST_PREFIX_" });

      expect(result).toBe("converted");
    });

    it("parses JSON values using destr", () => {
      process.env.TEST_PREFIX_JSON_VAR = '{"key": "value", "number": 42}';

      const result = getEnv("jsonVar", { prefix: "TEST_PREFIX_" });

      expect(result).toEqual({ key: "value", number: 42 });
    });

    it("parses numeric strings", () => {
      process.env.TEST_PREFIX_NUMBER_VAR = "123";

      const result = getEnv("numberVar", { prefix: "TEST_PREFIX_" });

      expect(result).toBe(123);
    });

    it("parses boolean strings", () => {
      process.env.TEST_PREFIX_BOOL_TRUE = "true";
      process.env.TEST_PREFIX_BOOL_FALSE = "false";

      const trueResult = getEnv("boolTrue", { prefix: "TEST_PREFIX_" });
      const falseResult = getEnv("boolFalse", { prefix: "TEST_PREFIX_" });

      expect(trueResult).toBe(true);
      expect(falseResult).toBe(false);
    });

    it("returns undefined when environment variable not found", () => {
      const result = getEnv("nonExistent", { prefix: "TEST_PREFIX_" });

      expect(result).toBeUndefined();
    });
  });

  describe("applyEnv", () => {
    it("applies environment variables to flat object", () => {
      process.env.TEST_PREFIX_NAME = "John";
      process.env.TEST_PREFIX_AGE = "30";

      const obj = { name: "default", age: 0, city: "default" };
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(result).toEqual({
        name: "John",
        age: 30,
        city: "default",
      });
    });

    it("applies environment variables to nested objects", () => {
      process.env.TEST_PREFIX_DATABASE_HOST = "localhost";
      process.env.TEST_PREFIX_DATABASE_PORT = "5432";
      process.env.TEST_PREFIX_API_TIMEOUT = "30_000";
      process.env.TEST_PREFIX_API_RETRIES = "3";

      const obj = {
        database: { host: "default", port: 0 },
        api: { timeout: 0, retries: 3 },
      };
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(result).toEqual({
        database: { host: "localhost", port: 5432 },
        api: { timeout: "30_000", retries: 3 },
      });
    });

    it("handles deeply nested objects", () => {
      process.env.TEST_PREFIX_LEVEL1_LEVEL2_LEVEL3_VALUE = "deep-value";

      const obj = {
        level1: {
          level2: {
            level3: { value: "default" },
          },
        },
      };
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(result.level1.level2.level3.value).toBe("deep-value");
    });

    it("overwrites nested objects with primitive values from env", () => {
      process.env.TEST_PREFIX_DATABASE = "simple-string";

      const obj = {
        database: { host: "localhost", port: 5432 },
      };
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(result.database).toBe("simple-string");
    });

    it("merges objects when env value is also an object", () => {
      process.env.TEST_PREFIX_DATABASE = '{"host": "env-host", "ssl": true}';

      const obj = {
        database: { host: "default", port: 5432 },
      };
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(result.database).toEqual({
        host: "env-host",
        port: 5432,
        ssl: true,
      });
    });

    it("preserves original values when no env variable exists", () => {
      const obj = {
        name: "original",
        nested: { value: "original-nested" },
      };
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(result).toEqual(obj);
    });

    it("handles arrays correctly (does not treat as objects)", () => {
      process.env.TEST_PREFIX_ITEMS = '["item1", "item2"]';

      const obj = { items: ["default"] };
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(result.items).toEqual(["item1", "item2"]);
    });

    it("expands environment variables in string values when envExpansion is true", () => {
      process.env.HOME = "/home/user";
      process.env.USER = "testuser";
      process.env.TEST_PREFIX_PATH = "{{HOME}}/{{USER}}/config";

      const obj = { path: "default" };
      const result = applyEnv(obj, {
        prefix: "TEST_PREFIX_",
        envExpansion: true,
      });

      expect(result.path).toBe("/home/user/testuser/config");
    });

    it("leaves unexpandable variables as-is when envExpansion is true", () => {
      process.env.HOME = "/Users/benjamin.zoerb";
      process.env.TEST_PREFIX_PATH = "{{HOME}}/{{NONEXISTENT}}/config";

      const obj = { path: "default" };
      const result = applyEnv(obj, {
        prefix: "TEST_PREFIX_",
        envExpansion: true,
      });

      expect(result.path).toBe("/Users/benjamin.zoerb/{{NONEXISTENT}}/config");
    });

    it("does not expand variables when envExpansion is false", () => {
      process.env.HOME = "/home/user";
      process.env.TEST_PREFIX_PATH = "{{HOME}}/config";

      const obj = { path: "default" };
      const result = applyEnv(obj, {
        prefix: "TEST_PREFIX_",
        envExpansion: false,
      });

      expect(result.path).toBe("{{HOME}}/config");
    });

    it("only expands string values, not other types", () => {
      process.env.HOME = "/home/user";
      process.env.TEST_PREFIX_NUMBER = "123";
      process.env.TEST_PREFIX_OBJECT = '{"path": "{{HOME}}/config"}';

      const obj = {
        number: 0,
        object: { path: "default" },
      };
      const result = applyEnv(obj, {
        prefix: "TEST_PREFIX_",
        envExpansion: true,
      });

      expect(result.number).toBe(123);
      expect(result.object).toEqual({ path: "/home/user/config" });
    });

    it("modifies the original object (mutation)", () => {
      process.env.TEST_PREFIX_VALUE = "modified";

      const obj = { value: "original" };
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(obj.value).toBe("modified");
      expect(result).toBe(obj);
    });

    it("handles complex nested expansion scenarios", () => {
      process.env.BASE_PATH = "/app";
      process.env.ENV = "production";
      process.env.LOG_LEVEL = "info";
      process.env.TEST_PREFIX_CONFIG_PATH = "{{BASE_PATH}}/config/{{ENV}}.json";
      process.env.TEST_PREFIX_CONFIG_LOG_LEVEL = "info";

      const obj = {
        config: { path: "default", logLevel: "debug" },
      };
      const result = applyEnv(obj, {
        prefix: "TEST_PREFIX_",
        envExpansion: true,
      });

      expect(result.config.path).toBe("/app/config/production.json");
      expect(result.config.logLevel).toBe("info");
    });

    it("handles null and undefined values", () => {
      process.env.TEST_PREFIX_NULL_VALUE = "overridden";
      process.env.TEST_PREFIX_UNDEFINED_VALUE = "overridden";

      const obj = {
        nullValue: undefined,
        undefinedValue: undefined,
        notSet: "default",
      };
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(result.nullValue).toBe("overridden");
      expect(result.undefinedValue).toBe("overridden");
      expect(result.notSet).toBe("default");

      delete process.env.TEST_PREFIX_NULL_VALUE;
      delete process.env.TEST_PREFIX_UNDEFINED_VALUE;
    });
  });

  describe("edge cases", () => {
    it("handles empty object", () => {
      const obj = {};
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(result).toEqual({});
    });

    it("handles very deep nesting", () => {
      process.env.TEST_PREFIX_A_B_C_D_E_F_VALUE = "deep";

      const obj = {
        a: { b: { c: { d: { e: { f: { value: "default" } } } } } },
      };
      const result = applyEnv(obj, { prefix: "TEST_PREFIX_" });

      expect(result.a.b.c.d.e.f.value).toBe("deep");
    });
  });
});
