import { describe, expect, it } from "vitest";
import { assistantAdminSettingsInput } from "./contracts";

describe("assistantAdminSettingsInput.model", () => {
  it("接受注册表里的两个模型", () => {
    for (const model of ["deepseek-flash", "deepseek-v4-pro"]) {
      const parsed = assistantAdminSettingsInput.parse({ model });
      expect(parsed.model).toBe(model);
    }
  });

  it("拒绝注册表之外的模型", () => {
    expect(() =>
      assistantAdminSettingsInput.parse({ model: "gpt-4" }),
    ).toThrow();
    expect(() =>
      assistantAdminSettingsInput.parse({ model: "" }),
    ).toThrow();
  });

  it("缺省时用默认模型", () => {
    const parsed = assistantAdminSettingsInput.parse({});
    expect(parsed.model).toBe("deepseek-flash");
  });
});
