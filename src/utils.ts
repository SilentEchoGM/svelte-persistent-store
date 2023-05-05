import {
  array as A,
  either as E,
  option as O,
  ord as Ord,
  record as R,
  function as f,
} from "fp-ts";

import semverGt from "semver/functions/gt";
import semverLt from "semver/functions/lt";
import semverValid from "semver/functions/valid";

import type { z } from "zod";

/**
 * A type representing a schema history object that can also be used to migrate
 * to the current schema. T is the type of the current schema, U is the union
 * type of all previous schemas. All migrations must return the current type
 * defined by the latest schema, they do not migrate to intermediate versions.
 */
export type SchemaHistory<
  T extends z.ZodTypeAny,
  U extends z.ZodTypeAny | z.ZodTypeAny = z.ZodTypeAny
> = {
  [key: string]: {
    schema: T | U;
    migration?: (oldData?: z.infer<U>) => z.infer<T>;
  };
};

/**
 * Utility function to parse a zod schema and return an Either
 *
 * @param  schema  A zod schema
 * @param  value  The value to parse
 * @returns  An Either containing the parsed value or the error
 */
export const parseSchema =
  <T extends z.ZodTypeAny>(schema: T) =>
  (value: unknown): E.Either<z.ZodError, z.infer<T>> => {
    const result = schema.safeParse(value);

    if (result.success) {
      return E.right(result.data);
    }

    return E.left(result.error);
  };

/**
 * Guard function to check if a value matches a schema
 *
 * @param  schema  A zod schema
 * @returns
 */
export const matchesSchema =
  <T extends z.ZodTypeAny>(schema: T) =>
  (value: unknown): value is z.infer<T> =>
    f.pipe(value, parseSchema(schema), E.isRight);

export const semverCompare = (a: string, b: string) => {
  if (!semverValid(a)) throw new Error(`Invalid semver: ${a}`);
  if (!semverValid(b)) throw new Error(`Invalid semver: ${b}`);

  if (semverGt(a, b)) return 1;

  if (semverLt(a, b)) return -1;

  return 0;
};

/** Ord instance for semver strings */
export const semverOrd = Ord.fromCompare<string>(semverCompare);

export const getLatestSemver = (versions: string[]) =>
  f.pipe(
    versions,
    A.sort(semverOrd),
    A.last,
    O.getOrElse(() => "0.0.0")
  );

/**
 * Get the latest version in a SchemaHistory object
 *
 * @param  schemaHistory
 * @returns  Semver string
 */
export const getLatestSchemaVersion = <
  T extends z.ZodTypeAny,
  V extends z.ZodTypeAny | z.ZodTypeAny
>(
  schemaHistory: SchemaHistory<T, V>
) => f.pipe(schemaHistory, R.keys, getLatestSemver);

/**
 * Get the default value for the latest schema in a SchemaHistory object
 *
 * @param  schemaHistory
 * @returns
 */
export const getLatestSchemaDefaultValue = <
  T extends z.ZodTypeAny,
  U extends z.ZodTypeAny | z.ZodTypeAny
>(
  schemaHistory: SchemaHistory<T, U>
): z.infer<T> =>
  f.pipe(schemaHistory, R.keys, getLatestSemver, (version) =>
    schemaHistory[version].schema.parse({})
  );

/**
 * Takes a SchemaHistory object and a value, sorts the SchemaHistory by version,
 * and then finds the first schema that can parse the value.
 *
 * Then it returns an Either containing the migrated value if there was a
 * migration function available for the found schema or an error if any of the
 * steps failed.
 *
 * @param  schemaHistory
 * @param  value
 * @returns
 */
export const migrate = <
  T extends z.ZodTypeAny,
  U extends z.ZodTypeAny | z.ZodTypeAny
>(
  schemaHistory: SchemaHistory<T, U>,
  value: unknown
) =>
  f.pipe(
    schemaHistory,
    R.keys,
    A.sort(semverOrd),
    A.reverse,
    A.findFirst((version) =>
      matchesSchema(schemaHistory[version].schema)(value)
    ),
    E.fromOption(() => new Error("No matching schema")),
    E.chain((version) => {
      const { migration } = schemaHistory[version];

      if (migration) {
        return f.pipe(
          migration(value),
          parseSchema(
            schemaHistory[getLatestSchemaVersion(schemaHistory)].schema
          )
        );
      }

      return E.left(new Error(`No migration available for ${version} schema`));
    })
  );
