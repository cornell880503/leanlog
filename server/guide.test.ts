import { describe, expect, it } from "vitest";
import { bfComment, diagnosis, ffmiComment, nutritionPlan, sideBalance, weightPace } from "../shared/guide";

const G = { bfMin: 10, bfMax: 12, ffmiMin: 19.5, ffmiMax: 21 };

describe("handbook helpers", () => {
  it("diagnoses the baseline scan as a muscle-gain problem", () => {
    const d = diagnosis({ bfPct: 13.8, ffmi: 18.45, inTarget: false }, G, false);
    expect(d).toContain("你不需要減肥，你需要長肌肉");
    expect(diagnosis(null, G, false)).toContain("還沒有掃描");
    expect(diagnosis({ bfPct: 11, ffmi: 20, inTarget: true }, G, true)).toContain("達標");
    expect(diagnosis({ bfPct: 11, ffmi: 20, inTarget: true }, G, false)).toContain("下一次掃描");
    expect(diagnosis({ bfPct: 16, ffmi: 20, inTarget: false }, G, false)).toContain("降下來");
    expect(diagnosis({ bfPct: 18, ffmi: 18, inTarget: false }, G, false)).toContain("不要大幅節食");
    expect(diagnosis({ bfPct: 11, ffmi: 21.5, inTarget: false }, G, false)).toContain("厚肌");
  });

  it("comments on body fat and FFMI bands", () => {
    expect(bfComment(13.8, G)).toContain("寬鬆");
    expect(bfComment(11, G)).toContain("目標區");
    expect(ffmiComment(18.45, G)).toContain("最大的缺口");
    expect(ffmiComment(20, G)).toBe("在目標區");
  });

  it("matches the handbook's nutrition numbers", () => {
    const p = nutritionPlan(70.5, 59.1);
    expect([p.proteinMinG, p.proteinMaxG]).toEqual([125, 155]);
    expect([p.maintenanceMin, p.maintenanceMax]).toEqual([2550, 2850]);
    expect(nutritionPlan(70, null).maintenanceMin).toBeNull();
  });

  it("reports left/right balance like the scan analysis", () => {
    const arm = sideBalance(2.9, 3.2, "arm")!;
    expect(arm.diffPct).toBeCloseTo(9.84, 1);
    expect(arm.comment).toContain("扣球手");
    const leg = sideBalance(10.1, 10.2, "leg")!;
    expect(leg.comment).toContain("非常平均");
    expect(sideBalance(null, 3, "arm")).toBeNull();
  });

  it("computes the monthly pace of the 7-day average", () => {
    const pts = (n: number, perDay: number) =>
      Array.from({ length: n }, (_, i) => {
        const d = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
        return { date: d, avg7: 70 + perDay * i };
      });
    expect(weightPace(pts(10, 0.01))).toBeNull(); // under two weeks
    const good = weightPace(pts(35, 0.4 / 28))!;
    expect(good.perMonthKg).toBeCloseTo(0.4, 2);
    expect(good.tone).toBe("good");
    expect(weightPace(pts(30, 0.03))!.tone).toBe("warn");
    expect(weightPace(pts(30, -0.01))!.verdict).toContain("多吃");
    expect(weightPace(pts(30, 0.001))!.tone).toBe("neutral");
  });
});
