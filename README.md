# Getting Started

This package provides a Svelte store that is typed by [Zod](https://github.com/colinhacks/zod) schemas, uses [Fantasy Land](https://github.com/fantasyland/fantasy-land) types with [fp-ts](https://github.com/gcanti/fp-ts), persists data with [localForage](https://github.com/localForage/localForage), and inherently versions data with basic migration features. Will not work correctly in the server context of a SvelteKit app (or anywhere the localstorage and IndexedDB facilities are unavailable)

## Example usage

Simple:

```ts
import { persistent } from "@silentecho/svelte-persistent-store";

import { z } from "zod";

const oldSchema = z.object({
  name: z.string(),
});

const schema = z.object({
  name: z.string(),
  age: z.number(),
});

const store = persistent<typeof schema>("demo_key", {
  "1.0.0": {
    schema,
    migration: (oldData: { name: string }) => ({ ...oldData, age: 0 }),
  },
  "0.9.0": {
    schema: oldSchema,
  },
});
```

Specific:

```ts
import { persistent } from "@silentecho/svelte-persistent-store";

import { z } from "zod";

const oldSchema = z.object({
  name: z.string(),
});

const schema = z.object({
  name: z.string(),
  age: z.number(),
});

const store = persistent<typeof schema, typeof oldSchema>(
  "demo_key",
  {
    "1.0.0": {
      schema,
      migration: (oldData: { name: string }) => ({ ...oldData, age: 0 }),
    },
    "0.9.0": {
      schema: oldSchema,
    },
  },
  {
    name: "John",
    age: 90,
  },
  "1.0.0"
);
```
