import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { ACTUAL_SERVER_URL: "http://actual:5006", ACTUAL_PASSWORD: "secret" };

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig(base)).toEqual({
      host: "127.0.0.1",
      port: 3000,
      actualServerUrl: "http://actual:5006",
      actualPassword: "secret",
      syncId: undefined,
      budgetName: undefined,
      dataDir: "./data",
      syncIntervalMs: 60_000,
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
});
