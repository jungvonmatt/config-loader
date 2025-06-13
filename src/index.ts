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

const promptFn = enquirer?.prompt;

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

export type PromptOptions = Exclude<
  Parameters<typeof promptFn>[0],
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
  missing: string[];
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

export async function loadConfig<
  T extends Record<string, any> = Record<string, any>,
  TOverrides extends Record<string, any> = {
    [K in keyof T]: T[K];
  },
  TDefaultConfig extends Record<string, any> = {
    [K in keyof T]: T[K];
  },
  TKeys extends Array<Exclude<keyof T, number | symbol>> = Array<
    Exclude<keyof T, number | symbol>
  >,
  TResult extends Record<string, any> = TOverrides &
    TDefaultConfig & {
      [K in TKeys[number]]?: any;
    } & T,
>(options: {
  name: string;
  searchStrategy?: SearchStrategy;
  searchPlaces?: string[];
  envMap?: Record<string, keyof T>;
  dotenv?: boolean;
  envName?: string | false;
  cwd?: string;
  configFile?: string;
  overrides?: Partial<TOverrides>;
  defaultConfig?: Partial<TDefaultConfig>;
  required?:
    | TKeys
    | ((config: TResult) => TKeys)
    | ((config: TResult) => Promise<TKeys>);
  prompt?:
    | TKeys
    | ((config: TResult) => TKeys)
    | ((config: TResult) => Promise<TKeys>);
  prompts?:
    | false
    | Array<PromptOptions>
    | ((config: TResult) => Array<PromptOptions> | Promise<PromptOptions>);
}): Promise<ConfigLoaderResult<TResult>> {
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

  const required =
    typeof options.required === "function"
      ? await options.required(config)
      : options.required;
  const prompt =
    typeof options.prompt === "function"
      ? await options.prompt(config)
      : options.prompt;

  // 5: prompt for missing required fields
  if (Array.isArray(required) || Array.isArray(prompt)) {
    const keys = Object.keys(config) as Array<keyof T>;
    const missing = required?.filter((key) => !keys.includes(key)) ?? [];

    if (missing.length > 0 || prompt?.length) {
      if (!hasTTY || options.prompts === false) {
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

      const promptKeys = Array.isArray(prompts)
        ? [...new Set([...missing, ...(prompt || [])])].sort((a, b) => {
            const aIndex = prompts.findIndex((p) => p.name === a);
            const bIndex = prompts.findIndex((p) => p.name === b);
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
          })
        : [...new Set([...missing, ...(prompt || [])])];

      const missingPrompts = promptKeys.map((key) => findPrompt(key as string));

      const response = await promptFn<Partial<T>>(missingPrompts);
      return {
        config: defu({}, response, config) as TResult,
        filepath,
        isEmpty,
        missing,
      };
    }
  }

  return { config, filepath, isEmpty, missing: [] };
}

export type LoadConfigOptions<T extends Record<string, any>> = Parameters<
  typeof loadConfig<T>
>[0];

export type { Prompt } from "enquirer";
