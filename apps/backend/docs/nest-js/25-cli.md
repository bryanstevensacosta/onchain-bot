# CLI & Scripts

## Installation

```bash
npm install -g @nestjs/cli
# Or run without global install:
npx @nestjs/cli@latest
```

## Basic Workflow

```bash
nest new my-nest-project
cd my-nest-project
npm run start:dev
```

## Commands Overview

| Command | Alias | Description |
|---------|-------|-------------|
| `new` | `n` | Scaffolds a new standard mode app |
| `generate` | `g` | Generates components (controllers, services, etc.) |
| `build` | | Compiles the application |
| `start` | | Compiles and runs the application |
| `add` | | Imports a packaged Nest library |
| `info` | `i` | Displays installed Nest packages and system info |

### Syntax

```bash
nest commandOrAlias requiredArg [optionalArg] [options]
# Example:
nest new my-project --dry-run
nest n my-project -d          # same as above (n = new, -d = dry-run)
```

## Generate Command

```bash
nest g <schematic> [name] [options]
```

### Commonly used schematics

```bash
nest g controller cats       # generates cats.controller.ts
nest g service cats          # generates cats.service.ts
nest g module cats           # generates cats.module.ts
nest g resource cats         # full CRUD (controller + service + module + DTOs)
nest g guard auth            # generates auth.guard.ts
nest g pipe validation       # generates validation.pipe.ts
nest g interceptor logging   # generates logging.interceptor.ts
nest g filter http-exception # generates http-exception.filter.ts
nest g middleware logger     # generates logger.middleware.ts
nest g decorator user        # generates user.decorator.ts
```

### Options

| Flag | Alias | Description |
|------|-------|-------------|
| `--dry-run` | `-d` | Report changes without writing files |
| `--flat` | | Don't generate a dedicated folder |
| `--spec` | | Generate spec files (default: true) |
| `--no-spec` | | Skip spec file generation |

## Build & Start

```bash
nest build          # compile with tsc (default)
nest build --watch  # watch mode

nest start          # build + run
nest start --watch  # hot-reload
nest start --debug  # debug mode (--inspect)

# SWC builder (20x faster)
nest start --watch -b swc
```

### Package Scripts (recommended)

Nest auto-generates these in `package.json`:

```json
{
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\"",
    "format": "prettier --write \"src/**/*.ts\""
  }
}
```

Run with:

```bash
npm run build
npm run start:dev
```

## Workspaces (Monorepo Mode)

Enable monorepo by adding a project to an existing standard mode app:

```bash
nest new my-project
cd my-project
nest generate app my-app
```

### Structure

```
apps/
├── my-project/       # default project
│   ├── src/
│   └── tsconfig.app.json
└── my-app/           # additional app
    ├── src/
    └── tsconfig.app.json
nest-cli.json
package.json
tsconfig.json
```

### Commands in monorepo

```bash
nest start              # starts default project (my-project)
nest start my-app       # starts my-app
nest build my-app       # builds only my-app
```

## nest-cli.json Configuration

```json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "apps/my-project/src",
  "monorepo": true,
  "root": "apps/my-project",
  "compilerOptions": {
    "webpack": true,
    "tsConfigPath": "apps/my-project/tsconfig.app.json",
    "deleteOutDir": true,
    "assets": ["**/*.graphql"],
    "watchAssets": true,
    "manualRestart": true
  },
  "generateOptions": {
    "spec": { "service": false, "controller": true }
  },
  "projects": {
    "my-project": {
      "type": "application",
      "root": "apps/my-project",
      "entryFile": "main",
      "sourceRoot": "apps/my-project/src"
    }
  }
}
```

### Compiler Options

| Option | Type | Description |
|--------|------|-------------|
| `webpack` | boolean | Use webpack (default: true for monorepo) |
| `builder` | string | `tsc`, `swc`, or `webpack` |
| `typeCheck` | boolean | Type checking for SWC |
| `tsConfigPath` | string | TS config file path |
| `deleteOutDir` | boolean | Clean output before build |
| `assets` | array | Non-TS files to copy to output |
| `watchAssets` | boolean | Watch asset files |
| `manualRestart` | boolean | Enable `rs` restart shortcut |

### Generate Options

```json
{
  "generateOptions": {
    "spec": false,                    // disable all specs
    "spec": { "service": false },     // disable only service specs
    "flat": true                      // flat file structure
  }
}
```

## Assets

```json
{
  "compilerOptions": {
    "assets": [
      { "include": "**/*.graphql", "exclude": "**/omitted.graphql", "watchAssets": true },
      "**/*.json"
    ]
  }
}
```

Assets must be inside `src/` to be copied.
