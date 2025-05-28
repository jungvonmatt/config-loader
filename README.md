# @jungvonmatt/config-loader

<!-- automd:badges color=yellow -->

[![npm version](https://img.shields.io/npm/v/@jungvonmatt/config-loader?color=yellow)](https://npmjs.com/package/@jungvonmatt/config-loader)
[![npm downloads](https://img.shields.io/npm/dm/@jungvonmatt/config-loader?color=yellow)](https://npm.chart.dev/@jungvonmatt/config-loader)

<!-- /automd -->

> Load configuration from files, environment variables, and interactively prompt for missing values

A flexible configuration loader that combines multiple configuration sources with interactive prompts for missing required values. Inspired by [c12](https://github.com/unjs/c12), built on top of [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) and [jiti](https://github.com/unjs/jiti) with additional features for environment variable mapping and user prompts.

## Features

- 🔍 **Multiple config sources**: Load from package.json, rc files, config files, and more
- 🌍 **Environment variable support**: Automatic dotenv loading and environment variable mapping
- 💬 **Interactive prompts**: Ask users for missing required configuration values
- 🔄 **Config merging**: Smart merging of configuration from multiple sources with overrides
- 📁 **Flexible file formats**: Support for JSON, YAML, JS, TS, and more
- 🛡️ **TypeScript support**: Full TypeScript support with type safety

## Installation

```sh
# ✨ Auto-detect (supports npm, yarn, pnpm, deno and bun)
npx nypm install @jungvonmatt/config-loader
```

## Usage

<!-- automd:jsimport cdn name="@jungvonmatt/config-loader" -->

**ESM** (Node.js, Bun, Deno)

```js
import {} from "@jungvonmatt/config-loader";
```

**CDN** (Deno, Bun and Browsers)

```js
import {} from "https://esm.sh/@jungvonmatt/config-loader";
```

<!-- /automd -->

### Basic Example

```js
import { loadConfig } from "@jungvonmatt/config-loader";

const { config } = await loadConfig({
  name: "myapp",
  defaultConfig: {
    port: 3000,
    host: "localhost",
  },
});

console.log(config.port); // 3000
```

### With Required Fields and Prompts

```js
import { loadConfig } from "@jungvonmatt/config-loader";

const { config } = await loadConfig({
  name: "myapp",
  required: ["apiKey", "databaseUrl"],
  prompts: [
    {
      name: "apiKey",
      type: "password",
      message: "Enter your API key:",
    },
    {
      name: "databaseUrl",
      type: "input",
      message: "Enter database URL:",
    },
  ],
});
```

### Environment Variable Mapping

```js
const { config } = await loadConfig({
  name: "myapp",
  envMap: {
    DATABASE_URL: "databaseUrl",
    API_KEY: "apiKey",
    PORT: "port",
  },
  defaultConfig: {
    port: 3000,
  },
});
```

## Configuration Files

The loader searches for configuration in the following locations (in order):

- `package.json` (in a `myapp` property)
- `.myapprc`
- `.myapprc.json`
- `.myapprc.yaml` / `.myapprc.yml`
- `.myapprc.js` / `.myapprc.ts` / `.myapprc.mjs` / `.myapprc.cjs`
- `.config/.myapprc.*`
- `myapp.config.js` / `myapp.config.ts` / `myapp.config.mjs` / `myapp.config.cjs`

Where `myapp` is the name you provide in the options.

### Example Config Files

**`.myapprc.json`**

```json
{
  "port": 8080,
  "database": {
    "url": "postgresql://localhost/mydb"
  }
}
```

**`myapp.config.js`**

```js
export default {
  port: process.env.PORT || 3000,
  database: {
    url: process.env.DATABASE_URL,
  },
};
```

## Environment Variables

### Automatic Environment Loading

Environment variables are automatically loaded from `.env` files:

- `.env.{NODE_ENV}` (e.g., `.env.production`)
- `.env`

### Configuration Override Pattern

Any configuration can be overridden using environment variables with the pattern:

```
{NAME}_CONFIG_{PATH}
```

For example, with `name: "myapp"`:

- `MYAPP_CONFIG_PORT=8080` sets `config.port = 8080`
- `MYAPP_CONFIG_DATABASE_URL=...` sets `config.databaseUrl = ...`

## API

### `loadConfig<T>(options: LoadConfigOptions<T>): Promise<CosmiconfigResult<T>>`

#### Options

| Option          | Type                                                  | Default                | Description                                                                                                     |
| --------------- | ----------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `name`          | `string`                                              | **Required**           | Name of the configuration (used for file searching)                                                             |
| `defaultConfig` | `Partial<T>`                                          | `{}`                   | Default configuration values                                                                                    |
| `overrides`     | `Partial<T>`                                          | `{}`                   | Configuration overrides (highest priority)                                                                      |
| `required`      | `Array<keyof T>`                                      | `[]`                   | Array of required configuration keys                                                                            |
| `envMap`        | `Record<string, keyof T>`                             | `{}`                   | Map environment variable names to config keys                                                                   |
| `dotenv`        | `boolean`                                             | `true`                 | Whether to load .env files                                                                                      |
| `envName`       | `string \| false`                                     | `process.env.NODE_ENV` | Environment name for .env.{envName} file                                                                        |
| `cwd`           | `string`                                              | `process.cwd()`        | Working directory for file searching                                                                            |
| `configFile`    | `string`                                              | `undefined`            | Path to a specific config file to load                                                                          |
| `prompts`       | `PromptOptions[] \| ((config: T) => PromptOptions[])` | `[]`                   | Interactive prompts for missing values. See [enquirer](https://github.com/enquirer/enquirer) for syntax details |

#### Returns

```typescript
interface ConfigLoaderResult<T> {
  config: T; // The merged configuration object
  filepath: string; // Path to the config file that was loaded
  isEmpty: boolean; // Whether the config file was empty
}
```

#### Prompt Options

Prompts use [enquirer](https://github.com/enquirer/enquirer) under the hood:

```typescript
interface PromptOptions {
  name: string; // Configuration key name
  type: string; // Prompt type: 'input', 'password', 'select', etc.
  message: string; // Prompt message
  choices?: string[]; // For select/multiselect prompts
  initial?: any; // Default value
  // ... other enquirer options
}
```

## Examples

### Complete Application Setup

```js
import { loadConfig } from '@jungvonmatt/config-loader'

interface AppConfig {
  port: number
  host: string
  database: {
    url: string
    pool: number
  }
  apiKey: string
  features: string[]
}

const { config } = await loadConfig<AppConfig>({
  name: 'myapp',

  // Default values
  defaultConfig: {
    port: 3000,
    host: 'localhost',
    database: {
      pool: 10
    },
    features: []
  },

  // Required fields that must be provided
  required: ['databaseUrl', 'apiKey'],

  // Map environment variables
  envMap: {
    'DATABASE_URL': 'databaseUrl',
    'API_KEY': 'apiKey',
    'PORT': 'port'
  },

  // Interactive prompts for missing required values
  prompts: [
    {
      name: 'databaseUrl',
      type: 'input',
      message: 'Database connection URL:',
      initial: 'postgresql://localhost:5432/myapp'
    },
    {
      name: 'apiKey',
      type: 'password',
      message: 'API Key:'
    }
  ]
})

console.log(`Starting server on ${config.host}:${config.port}`)
```

## Development

<details>

<summary>Local development</summary>

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

</details>

## License

<!-- automd:contributors license=MIT -->

Published under the [MIT](https://github.com/jungvonmatt/config-loader/blob/main/LICENSE) license.
Made by [community](https://github.com/jungvonmatt/config-loader/graphs/contributors) 💛
<br><br>
<a href="https://github.com/jungvonmatt/config-loader/graphs/contributors">
<img src="https://contrib.rocks/image?repo=jungvonmatt/config-loader" />
</a>

<!-- /automd -->

<!-- automd:with-automd -->

---

_🤖 auto updated with [automd](https://automd.unjs.io)_

<!-- /automd -->
