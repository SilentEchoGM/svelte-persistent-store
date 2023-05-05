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

/**
 * Creates a store that takes a SchemaHistory object and uses localforage to
 * persist its value and zod to validate any mutations.
 *
 * The store will automatically migrate data from older versions of the schema
 * to the current version if a migration function is available.
 *
 * SchemaHistory object:
 *
 * ```js
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
 * You need to supply a union of your schema types across all the versions as
 * the type for T. T is not the type of the store, but the type of the schemas
 * in the SchemaHistory object.
 *
 * @param  key  A unique key for the store, this will be prefixed with
 *   `silent-screen-{currentVersion}-`
 * @param  schemaHistory  A record of schemas and migrations keyed by semver
 *   (see above example)
 * @param  currentVersion  The current version of the schema
 * @param  defaultValue  The default value to use if no value is found in
 *   storage
 * @returns  _If you are aware of a way to sensibly infer that union type for T
 *   automatically from `schemaHistory`, please let me know._
 */
export const persistent = <T extends z.ZodTypeAny, U = z.infer<T>>(
  key: string,
  schemaHistory: SchemaHistory<T>,
  currentVersion = getLatestSchemaVersion(schemaHistory),
  defaultValue = getLatestSchemaDefaultValue(schemaHistory)
): Writable<U> & { load: () => Promise<U>; value: U; __key: string } => {
  const processedKey = `silent-screen-${currentVersion}-${key}`;
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

export type PersistentStore<T extends z.ZodTypeAny> = ReturnType<
  typeof persistent<T>
>;
