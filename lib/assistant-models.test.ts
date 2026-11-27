import { describe, expect, it } from "vitest";
import {
  ASSISTANT_DEFAULT_MODEL,
  ASSISTANT_MODEL_IDS,
  ASSISTANT_MODEL_REGISTRY,
  assistantModelInfo,
  isAssistantModelId,
} from "./assistant-models";

describe("assistant model registry", () => {
  it("注册表至少有一个模型，且 id 唯一", () => {
    expect(ASSISTANT_MODEL_REGISTRY.length).toBeGreaterThan(0);
    const ids = ASSISTANT_MODEL_REGISTRY.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ASSISTANT_MODEL_IDS).toEqual(ids);
  });

  it("默认模型在注册表里", () => {
    expect(isAssistantModelId(ASSISTANT_DEFAULT_MODEL)).toBe(true);
    expect(assistantModelInfo(ASSISTANT_DEFAULT_MODEL).id).toBe(
      ASSISTANT_DEFAULT_MODEL,
    );
  });

  it("每个模型都有中文名、短名与 maxTokens 上限", () => {
    for (const model of ASSISTANT_MODEL_REGISTRY) {
      expect(model.name.trim().length).toBeGreaterThan(0);
      expect(model.shortName.trim().length).toBeGreaterThan(0);
      expect(model.maxTokensCap).toBeGreaterThan(0);
    }
  });

  it("未知模型 id 回落到默认模型", () => {
    expect(isAssistantModelId("gpt-4")).toBe(false);
    expect(assistantModelInfo("gpt-4").id).toBe(ASSISTANT_DEFAULT_MODEL);
    expect(assistantModelInfo("").id).toBe(ASSISTANT_DEFAULT_MODEL);
  });
});
