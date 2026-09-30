import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const base = { ACTUAL_SERVER_URL: "http://actual:5006", ACTUAL_PASSWORD: "secret" };

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig(base)).toEqual({
      environment: "production",
      host: "127.0.0.1",
      port: 3000,
      actualServerUrl: "http://actual:5006",
      actualPassword: "secret",
      syncId: undefined,
      budgetName: undefined,
      dataDir: "./data",
      syncIntervalMs: 60_000,
      docsEnabled: false,
    });
  });

  it("treats empty strings as unset", () => {
    const config = loadConfig({ ...base, HOST: "", PORT: "", ACTUAL_SYNC_ID: "", SYNC_INTERVAL_MS: "" });
    expect(config).toMatchObject({ host: "127.0.0.1", port: 3000, syncId: undefined, syncIntervalMs: 60_000 });
  });

  it.each(["ACTUAL_SERVER_URL", "ACTUAL_PASSWORD"])("requires %s", (name) => {
    expect(() => loadConfig({ ...base, [name]: "" })).toThrow(`missing required env var ${name}`);
  });

  it("parses valid numbers", () => {
    expect(loadConfig({ ...base, PORT: "3001", SYNC_INTERVAL_MS: "5000" })).toMatchObject({
      port: 3001,
      syncIntervalMs: 5000,
    });
  });

  it.each(["-5", "abc", "0", "1.5", "65536"])("rejects PORT=%s", (value) => {
    expect(() => loadConfig({ ...base, PORT: value })).toThrow(/PORT must be an integer between 1 and 65535/);
  });

  it.each(["-5", "abc", "0", "999", "2147483648"])("rejects SYNC_INTERVAL_MS=%s", (value) => {
    expect(() => loadConfig({ ...base, SYNC_INTERVAL_MS: value })).toThrow(/SYNC_INTERVAL_MS must be an integer/);
  });

  it.each(["development", "production"])("accepts NODE_ENV=%s", (value) => {
    expect(loadConfig({ ...base, NODE_ENV: value }).environment).toBe(value);
  });

  it.each(["test", "prod", "Development"])("rejects NODE_ENV=%s", (value) => {
    expect(() => loadConfig({ ...base, NODE_ENV: value })).toThrow(
      /NODE_ENV must be one of development, production/,
    );
  });

  it.each([
    ["development", undefined, true],
    ["production", undefined, false],
    [undefined, undefined, false],
    ["development", "", true],
    ["development", "false", false],
    ["production", "true", true],
  ])("NODE_ENV=%s DOCS_ENABLED=%s -> docs %s", (nodeEnv, docs, expected) => {
    expect(loadConfig({ ...base, NODE_ENV: nodeEnv, DOCS_ENABLED: docs }).docsEnabled).toBe(expected);
  });

  it.each(["1", "yes", "TRUE", "off"])("rejects DOCS_ENABLED=%s", (value) => {
    expect(() => loadConfig({ ...base, DOCS_ENABLED: value })).toThrow(/DOCS_ENABLED must be "true" or "false"/);
  });
});
