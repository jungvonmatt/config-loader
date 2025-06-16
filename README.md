# @jungvonmatt/config-loader

[![npm version](https://img.shields.io/npm/v/@jungvonmatt/config-loader?color=yellow)](https://npmjs.com/package/@jungvonmatt/config-loader)
[![build status](https://github.com/jungvonmatt/config-loader/actions/workflows/ci.yml/badge.svg)](https://github.com/jungvonmatt/config-loader/actions)
[![coverage](https://sonarcloud.io/api/project_badges/measure?project=jungvonmatt_config-loader&metric=coverage)](https://sonarcloud.io/summary/new_code?id=jungvonmatt_config-loader)
[![sonarcloud status](https://sonarcloud.io/api/project_badges/measure?project=jungvonmatt_config-loader&metric=alert_status)](https://sonarcloud.io/dashboard?id=jungvonmatt_config-loader&metric=alert_status)

> Load configuration from files, environment variables, and interactively prompt for missing values

A flexible configuration loader that extends [c12](https://github.com/unjs/c12) with additional features for environment variable mapping and interactive user prompts. Built on top of the unjs ecosystem for modern Node.js applications.

## Features

- 🔍 **Multiple config sources**: Load from package.json, rc files, config files, and more
- 🌍 **Environment variable support**: Automatic dotenv loading and environment variable mapping
- 💬 **Interactive prompts**: Ask users for missing required configuration values
- 🔄 **Config merging**: Smart merging of configuration from multiple sources with overrides
- 📁 **Flexible file formats**: Support for JSON, YAML, JS, TS, and more
- 🛡️ **TypeScript support**: Full TypeScript support with type safety
- 🔗 **Config extension**: Built-in support for extending configurations from other files or remote sources

## Installation

```sh
# ✨ Auto-detect (supports npm, yarn, pnpm, deno and bun)
npx nypm install @jungvonmatt/config-loader
```

## Usage

<!-- automd:jsimport name="@jungvonmatt/config-loader" imports="loadConfig" -->

**ESM** (Node.js, Bun, Deno)

```js
import { loadConfig } from "@jungvonmatt/config-loader";
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

### Extending Configurations

```js
// config.ts
export default {
  extends: "./base.config.ts",
  port: 8080,
  database: {
    url: "postgresql://localhost/mydb"
  }
};

// base.config.ts
export default {
  port: 3000,
  host: "localhost",
  database: {
    url: "postgresql://localhost/default"
  }
};
```

## Configuration Files

The loader searches for configuration in the following locations (in order):

- `package.json` (in a `myapp` property)
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

### `loadConfig<T>(options: LoadConfigOptions<T>): Promise<ResolvedConfig<T>>`

#### Options

| Option          | Type                                                                           | Default                | Description                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | `string`                                                                       | **Required**           | Name of the configuration (used for file searching)                                                                                                                                          |
| `defaultConfig` | `Partial<T>`                                                                   | `{}`                   | Default configuration values                                                                                                                                                                 |
| `overrides`     | `Partial<T>`                                                                   | `{}`                   | Configuration overrides (highest priority)                                                                                                                                                   |
| `required`      | `Array<keyof T> \| ((config: T) => Array<keyof T> \| Promise<Array<keyof T>>)` | `[]`                   | Array of required configuration keys or a function that returns them. The function receives the current config as an argument.                                                               |
| `envMap`        | `Record<string, keyof T>`                                                      | `{}`                   | Map environment variable names to config keys                                                                                                                                                |
| `dotenv`        | `boolean`                                                                      | `true`                 | Whether to load .env files                                                                                                                                                                   |
| `envName`       | `string \| false`                                                              | `process.env.NODE_ENV` | Environment name for .env.{envName} file                                                                                                                                                     |
| `cwd`           | `string`                                                                       | `process.cwd()`        | Working directory for file searching                                                                                                                                                         |
| `configFile`    | `string`                                                                       | `undefined`            | Path to a specific config file to load                                                                                                                                                       |
| `prompt`        | `Array<keyof T> \| ((config: T) => Array<keyof T> \| Promise<Array<keyof T>>)` | `[]`                   | Array of configuration keys to prompt for, even if they exist in the config. Can be a function that returns the keys. Keys will be sorted based on the order in `prompts` if provided.       |
| `prompts`       | `PromptOptions[] \| ((config: T) => PromptOptions[])`                          | `[]`                   | Interactive prompts for missing values. See [enquirer](https://github.com/enquirer/enquirer) for syntax details. The order of prompts determines the order of fields in the prompt sequence. |

#### Returns

```typescript
interface ResolvedConfig<T> {
  config: T; // The merged configuration object
  filepath: string | undefined; // Path to the config file that was loaded
  missing: string[]; // Array of missing required fields
  layers: Array<{
    type: "module" | "file" | "env" | "overrides" | "default" | "prompt";
    filepath: string | undefined;
    config: Partial<T> | undefined;
    cwd: string | undefined;
  }>; // Array of configuration layers in order of application
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

## License

Published under the [MIT](https://github.com/jungvonmatt/config-loader/blob/main/LICENSE) license.
Made by [Jung von Matt TECH](https://github.com/jungvonmatt/config-loader/graphs/contributors) 💚
<br><br>
<a href="https://github.com/jungvonmatt/config-loader/graphs/contributors">
<img src="https://contrib.rocks/image?repo=jungvonmatt/config-loader" />
</a>

<!-- automd:with-automd -->

---

_🤖 auto updated with [automd](https://automd.unjs.io)_

<!-- /automd -->
