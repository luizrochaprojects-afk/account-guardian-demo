import { describe, it, expect } from "vitest";
import { visibleCreateProps } from "./createFormFields";

const prop = (key: string, show_in_create: boolean | undefined) =>
  ({ key, show_in_create }) as any;

describe("visibleCreateProps", () => {
  it("keeps props flagged show_in_create=true", () => {
    const out = visibleCreateProps([prop("name", true), prop("mrr", true)]);
    expect(out.map((p) => p.key)).toEqual(["name", "mrr"]);
  });

  it("drops props flagged show_in_create=false", () => {
    const out = visibleCreateProps([
      prop("mrr", true),
      prop("arr", false),
      prop("churned_date", false),
    ]);
    expect(out.map((p) => p.key)).toEqual(["mrr"]);
  });

  it("preserves input order", () => {
    const out = visibleCreateProps([
      prop("industry", true),
      prop("arr", false),
      prop("segment", true),
    ]);
    expect(out.map((p) => p.key)).toEqual(["industry", "segment"]);
  });

  it("treats a legacy row with an undefined flag as visible", () => {
    const out = visibleCreateProps([prop("legacy", undefined)]);
    expect(out.map((p) => p.key)).toEqual(["legacy"]);
  });
});
