import type { Loader, LoaderResult } from 'cosmiconfig'

import process from 'node:process'
import enquirer from 'enquirer'
import { cosmiconfig } from 'cosmiconfig'
import { defu } from 'defu'
import { createJiti } from 'jiti'
import { resolve } from 'pathe'
import { applyEnv } from './env'
import { snakeCase } from 'scule'
import { klona } from 'klona'

const prompt = enquirer?.prompt

const jiti = createJiti(import.meta.url)

const jitiLoader: Loader = async (filename: string) => {
  const mod = await jiti.import<LoaderResult>(filename)
  return (mod?.default ?? mod)
}

type PromptOptions = Exclude<Parameters<typeof prompt>[0], ((this: any) => any) | any[]>

type Explorer = ReturnType<typeof cosmiconfig>
type ConfigLoaderResult<T = LoaderResult> = Omit<Exclude<Awaited<ReturnType<Explorer['search']>>, null>, 'config'> & {
  config: T
}

function getExplorer(moduleName: string): Explorer {
  return cosmiconfig(moduleName, {
    searchStrategy: 'global',
    searchPlaces: [
      'package.json',
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
      '.ts': jitiLoader,
      '.js': jitiLoader,
      '.cjs': jitiLoader,
      '.mjs': jitiLoader,
    },
  })
}

async function search<T>(moduleName: string): Promise<ConfigLoaderResult<T>> {
  return getExplorer(moduleName).search() as Promise<ConfigLoaderResult<T>>
}

async function load<T>(moduleName: string, filename: string): Promise<ConfigLoaderResult<T>> {
  return getExplorer(moduleName).load(filename) as Promise<ConfigLoaderResult<T>>
}

interface LoadConfigOptions<T = Record<string, any>> {
  name: string
  envMap?: Record<string, keyof T>
  dotenv?: boolean
  envName?: string | false
  cwd?: string
  configFile?: string
  defaultConfig?: Partial<T>
  overrides?: Partial<T>
  required?: Array<keyof T>
  prompts?: Array<PromptOptions> | ((config: T) => Array<PromptOptions> | Promise<PromptOptions>)
}

export async function loadConfig<T extends Record<string, any> = Record<string, any>>(options: LoadConfigOptions<T>): Promise<ConfigLoaderResult<T>> {
  const envName = options?.envName ?? process.env.NODE_ENV
  const cwd = resolve(process.cwd(), options?.cwd || '.')
  const dotenv = options?.dotenv ?? true

  // 1: module config
  const moduleConfig = await search<T>(options.name)

  // 2: dedicated config file
  const extraConfig = options.configFile ? await load<T>(options.name, options.configFile) : ({} as ConfigLoaderResult<T>)

  const _config = defu({}, options.overrides, extraConfig.config, moduleConfig.config, options.defaultConfig) as T
  const filepath = extraConfig.filepath || moduleConfig.filepath
  const isEmpty = extraConfig.isEmpty && moduleConfig.isEmpty

  // load environment config
  let envConfig: Partial<T> = {}
  if (dotenv) {
    const envMap = options?.envMap ?? {}
    const dotenvx = await import('@dotenvx/dotenvx')

    const paths = envName ? [resolve(cwd, `.env.${envName}`), resolve(cwd, '.env')] : [resolve(cwd, '.env')]

    dotenvx.config({ path: paths, ignore: ['MISSING_ENV_FILE'], quiet: true })

    // allow overriding any configuration by using the pattern process.env.{NAME}_CONFIG_{PATH}.
    envConfig = applyEnv(klona(_config), {
      prefix: `${snakeCase(options.name).toUpperCase()}_CONFIG_`,
    }) as T

    // apply environment variables from envMap
    for (const [envKey, key] of Object.entries(envMap)) {
      const value = process.env[envKey]
      if (value !== undefined) {
        envConfig[key] = value as T[keyof T]
      }
    }
  }

  const config = defu({}, options.overrides, envConfig, _config) as T

  if (options.required) {
    const keys = Object.keys(config) as Array<keyof T>
    const missing = options.required.filter(key => !keys.includes(key))

    const prompts = Array.isArray(options.prompts) ? options.prompts : await options?.prompts?.(config) ?? undefined

    const findPrompt = (name: string) => {
      const fallback: PromptOptions = {
        name,
        type: 'input',
        message: `Please specify value for "${name}"`
      }


      if (Array.isArray(prompts)) {
        return prompts.find(prompt => prompt.name === name) || fallback
      }

      return fallback
    }

    const missingPrompts = missing.map(key => findPrompt(key as string))

    const response = await prompt<Partial<T>>(missingPrompts)

    return { config: defu({}, response, config) as T, filepath, isEmpty }
  }

  return { config, filepath, isEmpty }

}
