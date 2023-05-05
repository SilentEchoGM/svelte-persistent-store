import { getItem } from "localforage";
import { tick } from "svelte";
import { get } from "svelte/store";
import { z } from "zod";
import { persistent } from "../persistent";

jest.mock("localforage", () => ({
  setItem: async () => undefined,
  getItem: async function (key: string) {
    if (key === "silent-persistent-0.0.1-test") return { foo: "bar" };

    if (key === "silent-persistent-0.0.1-persist") return { foo: "persisted" };
    if (key === "silent-persistent-0.0.2-persist") return { foo: "persisted" };
  },
  removeItem: async () => undefined,
}));

describe("persistent", () => {
  it("check mock", async () => {
    const item = await getItem<Object>("silent-persistent-0.0.1-test");

    if (!item) throw new Error("No mock found");

    if (!("foo" in item)) {
      throw new Error("Mock is missing foo property");
    } else {
      expect(item.foo).toBe("bar");
    }
  });
  it("should create a persistent store", async () => {
    const schema = z.object({
      foo: z.string().default("bar"),
    });

    const schemaRecord = {
      "0.0.1": {
        schema,
      },
    };

    const store = persistent("test", schemaRecord);

    await tick();
    expect(store.value).toEqual({ foo: "bar" });
    expect(get(store)).toEqual({ foo: "bar" });

    store.set({ foo: "baz" });
    await tick();
    expect(store.value).toEqual({ foo: "baz" });
    expect(get(store)).toEqual({ foo: "baz" });

    store.update((value) => ({ foo: "qux" }));
    await tick();
    expect(store.value).toEqual({ foo: "qux" });
    expect(get(store)).toEqual({ foo: "qux" });
  });

  it("should load a persisted value", async () => {
    const schema = z.object({
      foo: z.string().default("bar"),
    });

    const schemaRecord = {
      "0.0.1": {
        schema,
      },
    };

    const store = persistent("persist", schemaRecord);

    await store.load();
    await tick();
    expect(store.value).toEqual({ foo: "persisted" });
    expect(get(store)).toEqual({ foo: "persisted" });

    store.set({ foo: "baz" });
    await tick();
    expect(store.value).toEqual({ foo: "baz" });
    expect(get(store)).toEqual({ foo: "baz" });

    store.update((value) => ({ foo: "qux" }));
    await tick();
    expect(store.value).toEqual({ foo: "qux" });
    expect(get(store)).toEqual({ foo: "qux" });
  });

  it("should fail to save an invalid value", async () => {
    const schema = z.object({
      foo: z.string().default("bar"),
    });

    const schemaRecord = {
      "0.0.1": {
        schema,
      },
    };

    const store = persistent("persist", schemaRecord);

    await store.load();

    expect(store.value).toEqual({ foo: "persisted" });
    expect(get(store)).toEqual({ foo: "persisted" });

    store.set({ foo: 123 } as any);
    expect(store.value).toEqual({ foo: "persisted" });
    expect(get(store)).toEqual({ foo: "persisted" });

    store.update((value) => ({ foo: 123 } as any));
    expect(store.value).toEqual({ foo: "persisted" });
    expect(get(store)).toEqual({ foo: "persisted" });
  });

  it("should migrate a value", async () => {
    const schema1 = z.object({
      foo: z.string().default("bar"),
    });

    const schema2 = z.object({
      foo: z.number().default(0),
    });

    const schemaRecord = {
      "0.0.2": {
        schema: schema2,
      },
      "0.0.1": {
        schema: schema1,
        migration: () => ({ foo: 0 }),
      },
    } as const;

    const store = persistent<typeof schema2, typeof schema1>(
      "persist",
      schemaRecord,
      undefined,
      "0.0.2"
    );

    await store.load();

    expect(store.value).toEqual({ foo: 0 });
    expect(get(store)).toEqual({ foo: 0 });
  });

  it("should fail to migrate a value and use a default instead", async () => {
    const schema1 = z.object({
      foo: z.string().default("bar"),
    });

    const schema2 = z.object({
      foo: z
        .object({
          bar: z.string().default("baz"),
        })
        .default({}),
    });

    const schemaRecord = {
      "0.0.2": {
        schema: schema2,
      },
      "0.0.1": {
        schema: schema1,
        migration: () => ({ foo: "baz" } as any),
      },
    } as const;

    const store = persistent<typeof schema2, typeof schema1>(
      "persist",
      schemaRecord,
      undefined,
      "0.0.2"
    );

    await store.load();

    expect(store.value).toEqual({ foo: { bar: "baz" } });
    expect(get(store)).toEqual({ foo: { bar: "baz" } });
  });

  it("should use a default value if no persisted value is found", async () => {
    const schema = z.object({
      foo: z.string().default("bar"),
    });

    const schemaRecord = {
      "0.0.1": {
        schema,
      },
    };

    const store = persistent("test2", schemaRecord);

    await store.load();

    expect(store.value).toEqual({ foo: "bar" });
    expect(get(store)).toEqual({ foo: "bar" });
  });

  it("should return the localforage key", () => {
    const schema = z.object({
      foo: z.string().default("bar"),
    });

    const schemaRecord = {
      "0.0.1": {
        schema,
      },
    };

    const store = persistent("test2", schemaRecord);

    expect(store.__key).toBe("silent-persistent-0.0.1-test2");
  });

  it("should return the value if already initialized", async () => {
    const schema = z.object({
      foo: z.string().default("bar"),
    });

    const schemaRecord = {
      "0.0.1": {
        schema,
      },
    };

    const store = persistent("test2", schemaRecord);

    await store.load();

    expect(await store.load()).toEqual({ foo: "bar" });
  });
});
