import {
  array as A,
  either as E,
  function as f,
  option as O,
  record as R,
} from "fp-ts";
import { z } from "zod";
import {
  getLatestSemver,
  migrate,
  SchemaHistory,
  semverCompare,
  semverOrd,
} from "../utils";

describe("utils", () => {
  it("should order semver versions", () => {
    const versions = [
      "1.0.0",
      "1.0.0",
      "1.0.0",
      "1.0.0",
      "0.0.0",
      "0.0.1",
      "1.0.1",
      "0.1.0",
      "0.1.1",
      "1.0.0",
    ];
    const expected = [
      "0.0.0",
      "0.0.1",
      "0.1.0",
      "0.1.1",
      "1.0.0",
      "1.0.0",
      "1.0.0",
      "1.0.0",
      "1.0.0",
      "1.0.1",
    ];
    const result = f.pipe(versions, A.sort(semverOrd));
    expect(result).toEqual(expected);
  });

  it("should throw if semver is invalid", () => {
    expect(() => semverOrd.compare("1.0.0", "invalid")).toThrow();
    expect(() => semverOrd.compare("invalid", "1.0.0")).toThrow();
  });

  it("should check equality of semver versions", () => {
    expect(semverOrd.compare("1.0.0", "1.0.0")).toBe(0);
    expect(semverOrd.compare("1.0.0", "1.0.1")).toBe(-1);
    expect(semverOrd.equals("1.0.0", "1.0.0")).toBe(true);
    expect(semverOrd.equals("1.0.0", "1.0.1")).toBe(false);
    expect(semverCompare("1.0.0", "1.0.0")).toBe(0);
    expect(semverCompare("1.0.0", "1.0.1")).toBe(-1);
  });

  it("should get latest semver", () => {
    const versions = [
      "1.0.0",
      "1.0.0",
      "1.0.0",
      "1.0.0",
      "0.0.0",
      "0.0.1",
      "1.0.1",
      "0.1.0",
      "0.1.1",
      "1.0.0",
    ];
    const expected = "1.0.1";
    const result = getLatestSemver(versions);
    expect(result).toEqual(expected);

    const emptyVersions: string[] = [];

    const emptyResult = getLatestSemver(emptyVersions);
    expect(emptyResult).toEqual("0.0.0");
  });

  it("should fail to migrate if schema is not found", () => {
    const schemaRecord: SchemaHistory<z.ZodTypeAny> = {
      "0.0.2": {
        schema: z.object({
          foo: z.string().default("bar"),
        }),
      },
    };

    expect(E.isLeft(migrate(schemaRecord, "fail"))).toBe(true);
  });

  it("should fail to migrate if migration function is not found", () => {
    const schemaRecord: SchemaHistory<z.ZodTypeAny> = {
      "0.0.2": {
        schema: z.object({
          foo: z.string().default("bar"),
        }),
      },
      "0.0.1": {
        schema: z.string(),
      },
    };

    expect(E.isLeft(migrate(schemaRecord, "fail"))).toBe(true);
  });
});
