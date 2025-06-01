import type { Loader, LoaderResult, SearchStrategy } from "cosmiconfig";
import process from "node:process";
import enquirer from "enquirer";
import fs from "node:fs";
import { cosmiconfig } from "cosmiconfig";
import { createDefu } from "defu";
import destr from "destr";
import { createJiti } from "jiti";
import { resolve } from "pathe";
import { hasTTY } from "std-env";
import { applyEnv } from "./env";
import { snakeCase } from "scule";
import { klona } from "klona";

const prompt = enquirer?.prompt;

const jiti = createJiti(import.meta.url);

const jitiLoader: Loader = async (filename: string) => {
  const mod = await jiti.import<LoaderResult>(filename);
  const exported = mod?.default ?? mod;

  // If the exported value is a function, call it to get the config
  if (typeof exported === "function") {
    return exported();
  }

  return exported;
};

type PromptOptions = Exclude<
  Parameters<typeof prompt>[0],
  ((this: any) => any) | any[]
>;

type Explorer = ReturnType<typeof cosmiconfig>;
type ConfigLoaderResult<T = LoaderResult> = Omit<
  Exclude<Awaited<ReturnType<Explorer["search"]>>, null>,
  "config" | "isEmpty" | "filepath"
> & {
  config: T;
  isEmpty: boolean;
  filepath: string | undefined;
};

// Create custom defu that replaces arrays instead of concatenating them
const defu = createDefu((obj, key, value) => {
  // If both the existing value and new value are arrays, replace instead of concatenate
  if (Array.isArray(obj[key]) && Array.isArray(value)) {
    obj[key] = value;
    return true;
  }
  return false;
});

function getExplorer(
  moduleName: string,
  searchStrategy?: SearchStrategy,
  searchPlaces?: string[],
): Explorer {
  return cosmiconfig(moduleName, {
    searchStrategy: searchStrategy || "global",
    searchPlaces: searchPlaces || [
      "package.json",
      `.${moduleName}rc`,
      `.${moduleName}rc.json`,
      `.${moduleName}rc.yaml`,
      `.${moduleName}rc.yml`,
      `.${moduleName}rc.js`,
      `.${moduleName}rc.ts`,
      `.${moduleName}rc.mjs`,
      `.${moduleName}rc.cjs`,
      `.config/${moduleName}rc`,
      `.config/${moduleName}rc.json`,
      `.config/${moduleName}rc.yaml`,
      `.config/${moduleName}rc.yml`,
      `.config/${moduleName}rc.js`,
      `.config/${moduleName}rc.ts`,
      `.config/${moduleName}rc.mjs`,
      `.config/${moduleName}rc.cjs`,
      `${moduleName}.config.js`,
      `${moduleName}.config.ts`,
      `${moduleName}.config.mjs`,
      `${moduleName}.config.cjs`,
    ],
    loaders: {
      ".ts": jitiLoader,
      ".js": jitiLoader,
      ".cjs": jitiLoader,
      ".mjs": jitiLoader,
    },
  });
}

async function search<T>(
  moduleName: string,
  searchFrom?: string,
  searchStrategy: SearchStrategy = "global",
  searchPlaces?: string[],
): Promise<ConfigLoaderResult<T> | null> {
  return getExplorer(moduleName, searchStrategy, searchPlaces).search(
    searchFrom,
  ) as Promise<ConfigLoaderResult<T>>;
}

async function load<T>(
  moduleName: string,
  filename: string,
): Promise<ConfigLoaderResult<T> | null> {
  if (fs.existsSync(filename)) {
    return getExplorer(moduleName).load(filename) as Promise<
      ConfigLoaderResult<T>
    >;
  }

  throw new Error(`Config file ${filename} not found`);
}

export interface LoadConfigOptions<
  T extends Record<string, any> = Record<string, any>,
  TOverrides extends Record<string, any> = {
    [K in keyof T]: T[K];
  },
  TDefaultConfig extends Record<string, any> = {
    [K in keyof T]: T[K];
  },
  TRequired extends Array<keyof T> = Array<keyof T>,
  TResult extends Record<string, any> = T &
    TOverrides &
    TDefaultConfig & {
      [K in TRequired[number]]?: any;
    },
> {
  name: string;
  searchStrategy?: SearchStrategy;
  searchPlaces?: string[];
  envMap?: Record<string, keyof T>;
  dotenv?: boolean;
  envName?: string | false;
  cwd?: string;
  configFile?: string;
  overrides?: Partial<TOverrides>;
  // overrides?: Record<keyof T, T[keyof T]>;
  defaultConfig?: Partial<TDefaultConfig>;
  // defaultConfig?: Record<keyof T, T[keyof T]>;
  required?: TRequired;
  prompts?:
    | Array<PromptOptions>
    | ((config: TResult) => Array<PromptOptions> | Promise<PromptOptions>);
}

export async function loadConfig<
  T extends Record<string, any> = Record<string, any>,
  TOverrides extends Record<string, any> = {
    [K in keyof T]: T[K];
  },
  TDefaultConfig extends Record<string, any> = {
    [K in keyof T]: T[K];
  },
  TRequired extends Array<keyof T> = Array<keyof T>,
  TResult extends Record<string, any> = T &
    TOverrides &
    TDefaultConfig & {
      [K in TRequired[number]]?: any;
    },
>(
  options: LoadConfigOptions<T, TOverrides, TDefaultConfig, TRequired, TResult>,
): Promise<ConfigLoaderResult<TResult>> {
  const envName = options?.envName ?? process.env.NODE_ENV;
  const cwd = resolve(process.cwd(), options?.cwd || ".");
  const dotenv = options?.dotenv ?? true;

  // 1: module config
  const moduleConfig = await search<T>(
    options.name,
    cwd,
    options?.searchStrategy,
    options?.searchPlaces,
  );

  // 2: dedicated config file
  const extraConfig = options.configFile
    ? await load<T>(options.name, options.configFile)
    : ({} as ConfigLoaderResult<T>);

  // 3: merge config
  const _config = defu(
    {},
    options.overrides,
    extraConfig?.config ?? {},
    moduleConfig?.config ?? {},
    options.defaultConfig,
  ) as T;

  // extraConfig filepath is preferred over moduleConfig filepath because it's more specific
  const filepath = extraConfig?.filepath || moduleConfig?.filepath;
  const isEmpty = Boolean(extraConfig?.isEmpty && moduleConfig?.isEmpty);

  // load environment config
  let envConfig: Partial<T> = {};
  if (dotenv) {
    const envMap = options?.envMap ?? {};
    const dotenvx = await import("@dotenvx/dotenvx");

    const paths = envName
      ? [resolve(cwd, `.env.${envName}`), resolve(cwd, ".env")]
      : [resolve(cwd, ".env")];

    dotenvx.config({ path: paths, ignore: ["MISSING_ENV_FILE"], quiet: true });

    // allow overriding any configuration by using the pattern process.env.{NAME}_CONFIG_{PATH}.
    envConfig = applyEnv(klona(_config), {
      prefix: `${snakeCase(options.name).toUpperCase()}_CONFIG_`,
    }) as T;

    // apply environment variables from envMap
    for (const [envKey, key] of Object.entries(envMap)) {
      const value = destr(process.env[envKey]);
      if (value !== undefined) {
        envConfig[key] = value as T[keyof T];
      }
    }
  }

  // 4: make sure overrides are preferred over envConfig
  const config = defu({}, options.overrides, envConfig, _config) as TResult;

  // 5: prompt for missing required fields
  if (options.required) {
    const keys = Object.keys(config) as Array<keyof T>;
    const missing = options.required.filter((key) => !keys.includes(key));

    if (missing.length > 0) {
      if (!hasTTY) {
        const missingKeys = missing.join(", ");
        throw new Error(
          `Configuration validation failed: Required fields are missing [${missingKeys}]. ` +
            `TTY is not available for interactive prompts. Please provide these values via environment variables or configuration files.`,
        );
      }

      const prompts = Array.isArray(options.prompts)
        ? options.prompts
        : ((await options?.prompts?.(config)) ?? undefined);

      const findPrompt = (name: string) => {
        const fallback: PromptOptions = {
          name,
          type: "input",
          message: `Please specify value for "${name}"`,
        };

        if (Array.isArray(prompts)) {
          return prompts.find((prompt) => prompt.name === name) || fallback;
        }

        return fallback;
      };

      const missingPrompts = missing.map((key) => findPrompt(key as string));

      const response = await prompt<Partial<T>>(missingPrompts);
      return {
        config: defu({}, response, config) as TResult,
        filepath,
        isEmpty,
      };
    }
  }

  return { config, filepath, isEmpty };
}
