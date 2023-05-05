import { getItem, setItem } from "localforage";
import { writable, type Writable } from "svelte/store";
import type { z } from "zod";
import {
  getLatestSchemaDefaultValue,
  getLatestSchemaVersion,
  migrate,
  parseSchema,
  type SchemaHistory,
} from "./utils";

import { either as E } from "fp-ts";

export type PersistentStore<T extends z.ZodTypeAny> = Writable<z.TypeOf<T>> & {
  load: () => Promise<z.TypeOf<T>>;
  value: z.TypeOf<T>;
  __key: string;
};

/**
 * Creates a store that takes a SchemaHistory object and uses localforage to
 * persist its value and zod to validate any mutations.
 *
 * The store will automatically migrate data from older versions of the schema
 * to the current version if a migration function is available.
 *
 * SchemaHistory object:
 *
 * ```ts
 * {
 *   "1.0.0": {
 *     schema: z.object({ ... }),
 *     migration: (oldData) => ({ ... })
 *   },
 *   "1.1.0": {
 *     schema: z.object({ ... }),
 *   }
 * }
 * ```
 *
 * Simple example:
 *
 * ```ts
 * const oldSchema = z.object({
 *   name: z.string(),
 * });
 *
 * const schema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 * });
 *
 * const store = persistent<typeof schema, typeof oldSchema>("demo_key", {
 *   "1.0.0": {
 *     schema,
 *     migration: (oldData: { name: string }) => ({ ...oldData, age: 0 }),
 *   },
 *   "0.9.0": {
 *     schema: oldSchema,
 *   },
 * });
 * ```
 *
 * You need to supply the type of the schema as the type for T. T is not the
 * type of the store's value, but should be the type of the latest schema in the
 * SchemaHistory object. V is the union of all previous schemas used in
 * migrations and defaults to the base zod type `z.ZodTypeAny`. U is the type of
 * the store's value and is inferred from T by default.
 *
 * @param  key  A unique key for the store, this will be prefixed with
 *   `silent-persistent-{currentVersion}-`
 * @param  schemaHistory  A record of schemas and migrations keyed by semver
 *   (see above example)
 * @param  DefaultValue  The default value to use if no value is found in
 *   storage, automatically set if not provided by using Zod's default
 *   `schemaHistory[currentVersion].parse({})`
 * @param  currentVersion  The current version of the schema, automatically set
 *   if not provided by checking the schemaHistory object
 * @returns  A writable store with a `load` function that returns a promise when
 *   a persisted value has been loaded or the default value has been set if no
 *   data was found, a `value` getter that returns the current value (uses a
 *   reference in the factory function closure rather than Svelte's `get`
 *   function, if that's a problem for you just use `get(store)` instead), and a
 *   `__key` property that returns the prefixed key of the store value in
 *   localforage (so exactly what to look for in devtools when debugging)
 */
export const persistent = <
  T extends z.ZodTypeAny,
  V extends z.ZodTypeAny | z.ZodTypeAny = z.ZodTypeAny,
  U = z.infer<T>
>(
  key: string,
  schemaHistory: SchemaHistory<T, V>,
  defaultValue = getLatestSchemaDefaultValue(schemaHistory),
  currentVersion = getLatestSchemaVersion(schemaHistory)
): PersistentStore<T> => {
  const processedKey = `silent-persistent-${currentVersion}-${key}`;
  const currentSchema = schemaHistory[currentVersion].schema;

  const __ = {
    value: defaultValue,
    initialized: false,
    setPromise: Promise.resolve(),
  };

  const { set, subscribe } = writable<U>(defaultValue);

  const save = (value: U) => {
    const result = parseSchema(currentSchema)(value);

    if (E.isLeft(result)) {
      console.error(result.left);
      __.setPromise = Promise.resolve();
      return;
    }

    __.setPromise = setItem(processedKey, value).then(() => {
      set(value);
      __.value = value;
    });
  };

  const update = (updater: (value: U) => U) => {
    const value = updater(__.value);

    try {
      currentSchema.parse(value);
    } catch (error) {
      console.error(error);
      return;
    }

    save(value);
  };

  /**
   * You can await this function to ensure that the store has been initialized
   * before using its value.
   *
   * @returns
   */
  const load = async () => {
    const setDefault = async () => {
      save(defaultValue);
      await __.setPromise;
      __.initialized = true;
      return defaultValue;
    };

    if (__.initialized) return __.value;
    const $value = await getItem(processedKey);

    const result = parseSchema(currentSchema)($value);

    if (E.isRight(result)) {
      set(result.right);
      __.initialized = true;
      __.value = result.right;
      return result.right;
    } else if (!$value) {
      console.warn(
        `Failed to load ${processedKey} from storage. ` +
          `No value found. Setting a default value.`
      );
      return setDefault();
    }

    const migrated = migrate(schemaHistory, $value);

    if (E.isLeft(migrated)) {
      console.warn(
        `Using default value after failing to migrate ${processedKey} ` +
          `to version ${currentVersion}. ${migrated.left}`
      );
      return setDefault();
    }

    save(migrated.right);
    return __.setPromise.then(() => {
      __.initialized = true;
      return migrated.right;
    });
  };

  load();

  return {
    subscribe,
    set: save,
    update,
    load,
    get value() {
      return __.value;
    },
    get __key() {
      return processedKey;
    },
  };
};
