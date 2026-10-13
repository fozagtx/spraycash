import { describe, expect, test } from "bun:test";
import { aggregate, deviationBps, median, parseRates } from "./fx";

const CURRENCIES = ["INR", "MXN", "PHP", "NGN"];

describe("parseRates", () => {
  test("reads frankfurter and er-api shapes and drops junk", () => {
    expect(parseRates({ amount: 1, base: "USD", rates: { INR: 83.4, MXN: 18.3 } }, CURRENCIES)).toEqual({
      INR: 83.4,
      MXN: 18.3,
    });
    expect(parseRates({ result: "success", rates: { INR: 83.5, NGN: 1530, PHP: "x", MXN: -1 } }, CURRENCIES)).toEqual({
      INR: 83.5,
      NGN: 1530,
    });
    expect(parseRates(null, CURRENCIES)).toEqual({});
  });
});

describe("aggregate", () => {
  test("takes the median of two agreeing sources", () => {
    const [inr] = aggregate([{ INR: 83.4 }, { INR: 83.6 }], ["INR"], 100, []);
    expect(inr).toEqual({ currency: "INR", status: "ok", rate: 83.5, scaled: 8_350_000_000, sources: 2 });
  });

  test("rejects sources that disagree by more than 1%", () => {
    const [inr] = aggregate([{ INR: 83 }, { INR: 85 }], ["INR"], 100, []);
    expect(inr.status).toBe("rejected");
  });

  test("allows single-source only where configured", () => {
    const results = aggregate([{ INR: 83 }, { NGN: 1530, INR: 83.1 }], ["INR", "NGN", "MXN"], 100, ["NGN"]);
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "rejected"]);
    expect(results[1]).toMatchObject({ sources: 1, scaled: 153_000_000_000 });
    const [php] = aggregate([{ PHP: 56 }, {}], ["PHP"], 100, ["NGN"]);
    expect(php).toMatchObject({ status: "rejected", reason: "only one source" });
  });

  test("helpers", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(deviationBps([100, 101])).toBeCloseTo(100);
  });
});
