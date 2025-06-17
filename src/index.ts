import process from "node:process";
import enquirer from "enquirer";
import type { Simplify } from "type-fest";
import fs from "node:fs";
import {
  loadConfig as c12LoadConfig,
  type ResolvableConfig,
  type ConfigLayer,
  type ResolvedConfig as C12ResolvedConfig,
  type UserInputConfig,
  type ConfigLayerMeta as C12ConfigLayerMeta,
  type LoadConfigOptions as C12LoadConfigOptions,
} from "c12";
import { findUp } from "find-up";
import { createDefu } from "defu";
import destr from "destr";
import { extname, resolve, dirname } from "pathe";
import { hasTTY } from "std-env";
import { applyEnv } from "./env";
import { snakeCase } from "scule";
import { klona } from "klona";

const promptFn = enquirer?.prompt;

export type PromptOptions = Exclude<
  Parameters<typeof promptFn>[0],
  ((this: any) => any) | any[]
>;

// Create custom defu that replaces arrays instead of concatenating them
const defu = createDefu((obj, key, value) => {
  // If both the existing value and new value are arrays, replace instead of concatenate
  if (Array.isArray(obj[key]) && Array.isArray(value)) {
    obj[key] = value;
    return true;
  }
  return false;
});

export function load<T extends UserInputConfig = UserInputConfig>(
  options: { name?: string; filename?: string; cwd?: string } = {},
) {
  const name = options?.name;
  const filename = options?.filename;
  if (filename && !fs.existsSync(filename)) {
    throw new Error(`Config file ${filename} not found`);
  }
  const configFile = filename?.replace(extname(filename), "");
  const cwd = dirname(
    resolve(options?.cwd || process.cwd(), filename || "config.json"),
  );

  return c12LoadConfig<T>({
    name,
    configFile,
    cwd,
    dotenv: false,
    rcFile: false,
  });
}

export type ConfigLayerMeta = Simplify<
  C12ConfigLayerMeta & {
    type: "module" | "file" | "env" | "prompt" | "overrides";
  }
>;

export type ResolvedConfig<
  T extends UserInputConfig,
  MT extends ConfigLayerMeta = ConfigLayerMeta,
> = Simplify<
  C12ResolvedConfig<T, MT> & {
    filepath: string | undefined;
    missing: string[];
  }
>;

const layersWithType = <T extends UserInputConfig>(
  layers: Array<ConfigLayer<T, C12ConfigLayerMeta>> | undefined,
  type: ConfigLayerMeta["type"],
): Array<ConfigLayer<T, ConfigLayerMeta>> => {
  return (
    layers?.map(
      (layer) =>
        ({
          ...layer,
          meta: { ...layer?.meta, type },
        }) as ConfigLayer<T, ConfigLayerMeta>,
    ) ?? []
  );
};

type BaseLoadConfigOptions<T extends UserInputConfig> = Omit<
  C12LoadConfigOptions<T>,
  | "name"
  | "cwd"
  | "configFile"
  | "defaults"
  | "defaultConfig"
  | "overrides"
  | "dotenv"
  | "rcFile"
  | "globalRc"
>;

export async function loadConfig<
  T extends UserInputConfig = UserInputConfig,
  TOverrides extends UserInputConfig = Partial<T>,
  TDefaultConfig extends UserInputConfig = Partial<T>,
  TKeys extends Array<Exclude<keyof T, number | symbol>> = Array<
    Exclude<keyof T, number | symbol>
  >,
  TResult extends UserInputConfig = Simplify<
    {
      [K in TKeys[number]]?: any;
    } & TDefaultConfig &
      TOverrides &
      T
  >,
>(
  options: Simplify<
    {
      name: string;
      envMap?: Record<string, keyof TResult>;
      dotenv?: boolean;
      envName?: string | false;
      cwd?: string;
      configFile?: string;
      overrides?: ResolvableConfig<TOverrides>;
      defaultConfig?: ResolvableConfig<TDefaultConfig>;
      defaults?: TResult;
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
    } & BaseLoadConfigOptions<TResult>
  >,
): Promise<ResolvedConfig<TResult, ConfigLayerMeta>> {
  const name = options?.name;
  const envName = options?.envName ?? process.env.NODE_ENV;
  const cwd = resolve(process.cwd(), options?.cwd || ".");
  const dotenv = options?.dotenv ?? true;

  const result: ResolvedConfig<TResult, ConfigLayerMeta> = {
    config: {} as TResult,
    filepath: undefined,
    missing: [],
    layers: [],
  };

  const rcFiles = [
    `.${name}rc.json`,
    `.${name}rc.yaml`,
    `.${name}rc.yml`,
    `.${name}rc.js`,
    `.${name}rc.mjs`,
    `.${name}rc.cjs`,
    `.${name}rc.ts`,
    `.${name}rc.mts`,
    `.${name}rc.cts`,
  ];

  const hasRcFilename = await findUp(rcFiles, { cwd });

  // 1: module config
  const moduleConfig = await c12LoadConfig<TResult>({
    ...options,
    name: options.name,
    cwd,
    configFile: hasRcFilename ? `.${name}rc` : undefined,
    dotenv: false,
    envName,
    packageJson: true,
    globalRc: true,
    defaults: options.defaults as TResult,
    defaultConfig: options.defaultConfig as ResolvableConfig<TResult>,
    overrides: options.overrides as ResolvableConfig<TResult>,
    merger: defu as any,
  });

  result.layers = layersWithType(moduleConfig.layers, "module");

  // 2: dedicated config file
  const extraConfig = options.configFile
    ? await load<TResult>({
        name: options.name,
        filename: options.configFile,
        cwd,
      })
    : ({} as Awaited<ReturnType<typeof load<TResult>>>);

  if (extraConfig.layers) {
    result.layers.push(...layersWithType(extraConfig.layers, "file"));
  }

  // 3: merge config
  const _config = defu(
    {},
    options.overrides,
    extraConfig?.config ?? {},
    moduleConfig?.config ?? {},
    options.defaultConfig,
  ) as TResult;

  // extraConfig filepath is preferred over moduleConfig filepath because it's more specific
  result.filepath = extraConfig?.configFile || moduleConfig?.configFile;

  // load environment config
  let envConfig: Partial<TResult> = {};
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
    }) as TResult;

    // apply environment variables from envMap
    for (const [envKey, key] of Object.entries(envMap)) {
      const value = destr(process.env[envKey]);
      if (value !== undefined) {
        envConfig[key] = value as T[keyof T];
      }
    }

    result.layers.push({
      meta: { type: "env" },
      config: envConfig as TResult,
      configFile: undefined,
      cwd: undefined,
    });
  }

  if (options.overrides) {
    result.layers.push({
      meta: { type: "overrides" },
      config: options.overrides as TResult,
      configFile: undefined,
      cwd: undefined,
    });
  }

  // 4: make sure overrides are preferred over envConfig
  result.config = defu({}, options.overrides, envConfig, _config) as TResult;

  const required =
    typeof options.required === "function"
      ? await options.required(result.config)
      : options.required;
  const prompt =
    typeof options.prompt === "function"
      ? await options.prompt(result.config)
      : options.prompt;

  // 5: prompt for missing required fields
  if (Array.isArray(required) || Array.isArray(prompt)) {
    const keys = Object.keys(result.config) as Array<keyof T>;
    const missing = required?.filter((key) => !keys.includes(key)) ?? [];
    result.missing = missing;

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
        : ((await options?.prompts?.(result.config)) ?? undefined);

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

      result.layers.push({
        meta: { type: "prompt" },
        config: response as TResult,
        configFile: undefined,
        cwd: undefined,
      });

      result.config = defu({}, response, result.config) as TResult;
    }
  }

  return result;
}

export type LoadConfigOptions<T extends UserInputConfig> = Simplify<
  Parameters<typeof loadConfig<T>>[0]
>;

export type { Prompt } from "enquirer";
