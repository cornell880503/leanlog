#!/usr/bin/env python3
"""薄肌 + 垂直跳躍 個人追蹤系統

用法：
  python3 tracker.py add-session <session.json>   新增一次訓練（重訓／排球／增強式）
  python3 tracker.py add-weight <YYYY-MM-DD> <kg> [--not-fasted] [--notes 文字]
  python3 tracker.py add-jump <YYYY-MM-DD> [--standing CM] [--approach CM] [--cmj CM] [--notes 文字]
  python3 tracker.py add-scan <scan.json>         新增一次 Boditrax 掃描
  python3 tracker.py add-food <YYYY-MM-DD> [--kcal N] [--protein G]
  python3 tracker.py session <session_id>         單次訓練摘要（含與上次比較）
  python3 tracker.py week [YYYY-Www]              週摘要（預設為最近有資料的一週）
  python3 tracker.py report                       產生完整儀表板 reports/dashboard.md 與圖表
"""
import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

plt.rcParams["font.family"] = "Noto Sans CJK TC"
plt.rcParams["axes.unicode_minus"] = False

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CHARTS = ROOT / "charts"
REPORTS = ROOT / "reports"
CFG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
HEIGHT_M = CFG["profile"]["height_cm"] / 100
MUSCLES = list(CFG["weekly_set_targets"].keys())
TZ = ZoneInfo(CFG["profile"].get("timezone", "Asia/Singapore"))


def today():
    return datetime.now(TZ).date()


# ---------------------------------------------------------------- 資料讀取
def read(name):
    return pd.read_csv(DATA / f"{name}.csv", dtype={"session_id": str})


def catalog():
    df = read("exercises").fillna("")
    lookup = {}
    for _, r in df.iterrows():
        keys = [r["exercise"]] + [a for a in str(r["aliases"]).split("|") if a]
        for k in keys:
            lookup[k.strip().lower()] = r["exercise"]
    return df.set_index("exercise"), lookup


def resolve(name, lookup):
    return lookup.get(str(name).strip().lower())


def split(v):
    return [x for x in str(v).split("|") if x and x != "nan"]


def bodyweight_on(d):
    """取得某日期（含之前）最近的體重；沒有就用最近一次掃描體重。"""
    d = pd.to_datetime(d)
    w = read("daily_weight")
    if not w.empty:
        w["date"] = pd.to_datetime(w["date"])
        prev = w[w["date"] <= d].sort_values("date")
        if not prev.empty:
            return float(prev.iloc[-1]["weight_kg"])
    s = read("body_scans")
    if not s.empty:
        s["date"] = pd.to_datetime(s["date"])
        prev = s[s["date"] <= d].sort_values("date")
        src = prev if not prev.empty else s.sort_values("date")
        return float(src.iloc[-1]["weight_kg"])
    return 70.0


def e1rm(load, reps):
    """Epley 推估 1RM；超過 12 下的組不推估。"""
    if pd.isna(load) or pd.isna(reps) or reps <= 0 or reps > 12 or load <= 0:
        return float("nan")
    return load * (1 + reps / 30)


def enriched_sets():
    """回傳加上 有效負重、容量、e1RM、肌群 的逐組資料。"""
    sets = read("sets")
    if sets.empty:
        return sets
    cat, _ = catalog()
    sets["date"] = pd.to_datetime(sets["date"])
    sets["is_warmup"] = sets["is_warmup"].fillna(0).astype(int)
    rows = []
    for _, r in sets.iterrows():
        info = cat.loc[r["exercise"]]
        bw = bodyweight_on(r["date"]) if float(info["bw_factor"] or 0) > 0 else 0
        load = float(info["bw_factor"] or 0) * bw + float(r["weight_kg"] if pd.notna(r["weight_kg"]) else 0)
        rec = r.to_dict()
        rec.update(
            category=info["category"],
            primary=split(info["primary"]),
            secondary=split(info["secondary"]),
            eff_load=load,
            tonnage=load * float(r["reps"]) if info["category"] not in ("plyo", "timed") else 0.0,
            e1rm=e1rm(load, r["reps"]) if info["category"] in ("compound", "isolation") else float("nan"),
        )
        rpe = r["rpe"]
        rec["hard"] = (
            (not r["is_warmup"])
            and info["category"] in ("compound", "isolation", "timed")
            and (pd.isna(rpe) or float(rpe) >= CFG["hard_set_rpe_min"])
        )
        rows.append(rec)
    out = pd.DataFrame(rows)
    out["week"] = out["date"].dt.strftime("%G-W%V")
    return out


def sessions_df():
    s = read("sessions")
    if s.empty:
        return s
    s["date"] = pd.to_datetime(s["date"])
    s["load"] = s["duration_min"].fillna(0) * s["srpe"].fillna(0)
    s["week"] = s["date"].dt.strftime("%G-W%V")
    return s


def scans_df():
    s = read("body_scans")
    if s.empty:
        return s
    s["date"] = pd.to_datetime(s["date"])
    s = s.sort_values("date")
    s["bf_pct"] = s["fat_mass_kg"] / s["weight_kg"] * 100
    s["ffmi"] = s["ffm_kg"] / HEIGHT_M**2
    s["ffmi_norm"] = s["ffmi"] + 6.1 * (1.8 - HEIGHT_M)
    s["arm_asym_pct"] = (s["muscle_rarm"] - s["muscle_larm"]) / ((s["muscle_rarm"] + s["muscle_larm"]) / 2) * 100
    s["leg_asym_pct"] = (s["muscle_rleg"] - s["muscle_lleg"]) / ((s["muscle_rleg"] + s["muscle_lleg"]) / 2) * 100
    return s


# ---------------------------------------------------------------- 寫入
def append(name, rows):
    path = DATA / f"{name}.csv"
    cols = pd.read_csv(path, nrows=0).columns
    df = pd.DataFrame(rows).reindex(columns=cols)
    df.to_csv(path, mode="a", header=False, index=False)


def cmd_add_session(args):
    payload = json.loads(Path(args.file).read_text(encoding="utf-8"))
    items = payload if isinstance(payload, list) else [payload]
    _, lookup = catalog()
    existing = read("sessions")
    new_ids = []
    for p in items:
        d = pd.to_datetime(p["date"]).strftime("%Y-%m-%d")
        n = int((existing["session_id"].astype(str).str.startswith(d)).sum()) + 1 if not existing.empty else 1
        n += sum(1 for i in new_ids if i.startswith(d))
        sid = f"{d}-{n}"
        unknown = [x["exercise"] for x in p.get("sets", []) if not resolve(x["exercise"], lookup)]
        if unknown:
            sys.exit(f"未知動作：{sorted(set(unknown))}，請先加入 data/exercises.csv")
        set_rows, counters = [], {}
        for x in p.get("sets", []):
            ex = resolve(x["exercise"], lookup)
            for _ in range(int(x.get("sets", 1))):
                counters[ex] = counters.get(ex, 0) + 1
                set_rows.append(
                    dict(
                        session_id=sid, date=d, exercise=ex, set_no=counters[ex],
                        reps=x["reps"], weight_kg=x.get("weight", 0), rpe=x.get("rpe"),
                        is_warmup=int(bool(x.get("warmup", False))), notes=x.get("notes", ""),
                    )
                )
        cat, _ = catalog()
        plyo_reps = sum(r["reps"] for r in set_rows if cat.loc[r["exercise"], "category"] == "plyo")
        append(
            "sessions",
            [dict(session_id=sid, date=d, type=p.get("type", "strength"),
                  duration_min=p.get("duration_min"), srpe=p.get("srpe"),
                  jumps=int(p.get("jumps", 0)) + int(plyo_reps), notes=p.get("notes", ""))],
        )
        if set_rows:
            append("sets", set_rows)
        new_ids.append(sid)
        print(f"已新增 {sid}（{p.get('type', 'strength')}，{len(set_rows)} 組）")
    for sid in new_ids:
        print()
        print(session_summary(sid))


def cmd_add_weight(args):
    append("daily_weight", [dict(date=args.date, weight_kg=args.kg, fasted=int(not args.not_fasted), notes=args.notes or "")])
    print(f"已新增體重 {args.date} {args.kg} kg")


def cmd_add_jump(args):
    append("jump_tests", [dict(date=args.date, standing_reach_cm=args.standing, approach_reach_cm=args.approach,
                              cmj_cm=args.cmj, bodyweight_kg=bodyweight_on(args.date), notes=args.notes or "")])
    print(f"已新增跳躍測試 {args.date}")


def cmd_add_scan(args):
    p = json.loads(Path(args.file).read_text(encoding="utf-8"))
    if "weight_kg" not in p or p["weight_kg"] in (None, ""):
        p["weight_kg"] = round(p["ffm_kg"] + p["fat_mass_kg"], 2)
    append("body_scans", [p])
    print(f"已新增掃描 {p['date']}")


def cmd_add_food(args):
    append("nutrition", [dict(date=args.date, kcal=args.kcal, protein_g=args.protein, notes=args.notes or "")])
    print(f"已新增飲食 {args.date}")


# ---------------------------------------------------------------- 分析
def session_summary(sid):
    s = sessions_df()
    meta = s[s["session_id"] == sid]
    if meta.empty:
        return f"找不到 {sid}"
    m = meta.iloc[0]
    lines = [f"## 訓練摘要 {sid}（{m['type']}）",
             "",
             f"- 時長 {m['duration_min']} 分鐘，自評強度 sRPE {m['srpe']}，訓練負荷 {m['load']:.0f}，跳躍次數 {int(m['jumps'])}"]
    es = enriched_sets()
    if es.empty or (es["session_id"] == sid).sum() == 0:
        return "\n".join(lines)
    cur = es[es["session_id"] == sid]
    lines.append("")
    lines.append("| 動作 | 正式組 | 總次數 | 最佳組 | 容量(kg) | e1RM | 與上次比較 |")
    lines.append("|---|---|---|---|---|---|---|")
    for ex, g in cur.groupby("exercise", sort=False):
        work = g[g["is_warmup"] == 0]
        best = work.loc[work["eff_load"].idxmax()] if not work.empty else g.iloc[0]
        e = work["e1rm"].max()
        prev = es[(es["exercise"] == ex) & (es["date"] < cur["date"].iloc[0]) & (es["is_warmup"] == 0)]
        cmp_txt = "首次紀錄"
        if not prev.empty:
            last_sid = prev.sort_values("date")["session_id"].iloc[-1]
            pg = prev[prev["session_id"] == last_sid]
            pe, pt = pg["e1rm"].max(), pg["tonnage"].sum()
            parts = []
            if pd.notna(e) and pd.notna(pe):
                parts.append(f"e1RM {e - pe:+.1f}")
            parts.append(f"容量 {work['tonnage'].sum() - pt:+.0f}")
            cmp_txt = "，".join(parts) + f"（對比 {last_sid}）"
        best_txt = f"{int(best['reps'])} 下" if best["eff_load"] == 0 else f"{best['eff_load']:.1f}kg×{int(best['reps'])}"
        lines.append(
            f"| {ex} | {len(work)} | {int(work['reps'].sum())} | {best_txt} | "
            f"{work['tonnage'].sum():.0f} | {'—' if pd.isna(e) else f'{e:.1f}'} | {cmp_txt} |"
        )
    hs = muscle_sets(cur)
    txt = "、".join(f"{k} {v:g}" for k, v in hs.items() if v > 0)
    lines.append("")
    lines.append(f"- 有效組數（主要肌群算 1、次要算 0.5）：{txt or '無'}")
    return "\n".join(lines)


def muscle_sets(df):
    out = {m: 0.0 for m in MUSCLES}
    for _, r in df[df["hard"]].iterrows():
        for m in r["primary"]:
            out[m] = out.get(m, 0) + 1
        for m in r["secondary"]:
            out[m] = out.get(m, 0) + 0.5
    return out


def week_bounds(week):
    y, w = week.split("-W")
    start = date.fromisocalendar(int(y), int(w), 1)
    return start, start + timedelta(days=6)


def weekly_table():
    s = sessions_df()
    es = enriched_sets()
    if s.empty:
        return pd.DataFrame()
    wk = s.groupby("week").agg(sessions=("session_id", "count"), load=("load", "sum"), jumps=("jumps", "sum"),
                               volleyball=("type", lambda x: (x == "volleyball").sum()),
                               strength=("type", lambda x: (x == "strength").sum()))
    if not es.empty:
        wk["tonnage"] = es.groupby("week")["tonnage"].sum()
        for w_, g in es.groupby("week"):
            for m, v in muscle_sets(g).items():
                wk.loc[w_, f"sets_{m}"] = v
    return wk.fillna(0).sort_index()


def current_week():
    return today().strftime("%G-W%V")


def week_summary(week=None):
    wk = weekly_table()
    if wk.empty:
        return "目前還沒有訓練紀錄。", []
    week = week or wk.index[-1]
    if week not in wk.index:
        return f"{week} 沒有紀錄。", []
    in_progress = week >= current_week()
    r = wk.loc[week]
    start, end = week_bounds(week)
    prev = wk[wk.index < week].tail(3)
    lines = [f"### 週摘要 {week}（{start} ~ {end}）{'｜本週進行中' if in_progress else ''}",
             "",
             f"- 訓練 {int(r['sessions'])} 次（重訓 {int(r['strength'])}、排球 {int(r['volleyball'])}）",
             f"- 總訓練負荷 {r['load']:.0f}（時長×sRPE），跳躍次數 {int(r['jumps'])}，重訓總容量 {r.get('tonnage', 0):.0f} kg"]
    flags = []
    if len(prev) >= 2:
        base_load, base_jump = prev["load"].mean(), prev["jumps"].mean()
        if base_load > 0:
            ratio = r["load"] / base_load
            lines.append(f"- 負荷是前 {len(prev)} 週平均的 {ratio:.2f} 倍")
            if ratio > CFG["load_spike_ratio"]:
                flags.append(f"訓練負荷比前幾週平均高 {ratio:.2f} 倍，注意恢復與膝蓋")
        if base_jump > 0 and r["jumps"] / base_jump > CFG["load_spike_ratio"]:
            flags.append(f"跳躍次數比前幾週平均高 {r['jumps'] / base_jump:.2f} 倍，髕骨肌腱風險升高")
    lines.append("")
    lines.append("| 肌群 | 本週有效組數 | 目標 | 狀態 |")
    lines.append("|---|---|---|---|")
    for m, (lo, hi) in CFG["weekly_set_targets"].items():
        v = r.get(f"sets_{m}", 0)
        st = ("尚未達標" if in_progress else "偏低") if v < lo else ("偏高" if v > hi else "達標")
        if v < lo and lo > 0 and not in_progress:
            flags.append(f"{m} 有效組數 {v:g}，低於目標 {lo}")
        lines.append(f"| {m} | {v:g} | {lo}–{hi} | {st} |")
    return "\n".join(lines), flags


def strength_trends(top=6):
    es = enriched_sets()
    if es.empty:
        return pd.DataFrame()
    es = es[(es["is_warmup"] == 0) & es["e1rm"].notna()]
    keys = es.groupby("exercise")["session_id"].nunique().sort_values(ascending=False).head(top).index
    return es[es["exercise"].isin(keys)].groupby(["exercise", "date"])["e1rm"].max().reset_index()


# ---------------------------------------------------------------- 圖表
def chart_body_map(sc):
    t = CFG["body_targets"]
    fig, ax = plt.subplots(figsize=(9, 6.2), dpi=150)
    ax.set_xlim(22, 6)
    ax.set_ylim(16.5, 23)
    ax.add_patch(Rectangle((10, 19), 5, 2, facecolor="#e8f5e9", edgecolor="#81c784", ls="--", lw=1.2, zorder=0))
    ax.text(14.85, 20.9, "寬鬆薄肌區", fontsize=8.5, color="#558b2f", va="top")
    ax.add_patch(Rectangle((t["bf_min"], t["ffmi_min"]), t["bf_max"] - t["bf_min"], t["ffmi_max"] - t["ffmi_min"],
                           facecolor="#a5d6a7", edgecolor="#2e7d32", lw=2.2, zorder=1))
    ax.text((t["bf_min"] + t["bf_max"]) / 2, (t["ffmi_min"] + t["ffmi_max"]) / 2 + 0.25,
            f"你的目標區\n體脂 {t['bf_min']:g}–{t['bf_max']:g}%\nFFMI {t['ffmi_min']:g}–{t['ffmi_max']:g}",
            ha="center", va="center", fontsize=10, color="#1b5e20", fontweight="bold", zorder=2)
    for ms in CFG["milestones"]:
        ffmi = ms["ffm_min_kg"] / HEIGHT_M**2
        ax.plot(ms["bf_max"], ffmi, marker="D", color="#1565c0", ms=7, zorder=3)
        ax.annotate(f"{ms['name']}（{ms['by'][:7]}）", (ms["bf_max"], ffmi), xytext=(-8, 6),
                    textcoords="offset points", ha="right", fontsize=8.5, color="#1565c0")
    ax.plot(sc["bf_pct"], sc["ffmi"], "-o", color="#d84315", lw=2, ms=6, zorder=4)
    last = sc.iloc[-1]
    ax.annotate(f"最新 {last['date']:%Y-%m-%d}\n體脂 {last['bf_pct']:.1f}%｜FFMI {last['ffmi']:.2f}",
                (last["bf_pct"], last["ffmi"]), xytext=(18.5, 17.2), fontsize=9.5, color="#bf360c",
                arrowprops=dict(arrowstyle="->", color="#bf360c"))
    ax.axhline(19, color="#999", lw=0.8, ls=":")
    ax.axvline(15, color="#999", lw=0.8, ls=":")
    ax.text(21.8, 16.7, "脂肪偏高、肌肉偏少", fontsize=8.5, color="#777")
    ax.text(9.2, 16.7, "瘦但肌肉不足", fontsize=8.5, color="#777")
    ax.text(21.8, 22.7, "有肌肉但被脂肪蓋住", fontsize=8.5, color="#777")
    ax.text(9.8, 22.7, "厚肌方向", fontsize=8.5, color="#777")
    ax.set_xlabel("體脂率 %（← 脂肪較多｜較精實 →）")
    ax.set_ylabel("FFMI 去脂體重指數")
    ax.set_title("身體組成地圖（Boditrax 掃描）", fontsize=13)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(CHARTS / "body_map.png")
    plt.close(fig)


def chart_segments(sc):
    last = sc.iloc[-1]
    labels = ["左臂", "右臂", "左腿", "右腿", "軀幹"]
    mus = [last[c] for c in ["muscle_larm", "muscle_rarm", "muscle_lleg", "muscle_rleg", "muscle_core"]]
    fat = [last[c] for c in ["fat_larm", "fat_rarm", "fat_lleg", "fat_rleg", "fat_core"]]
    fig, axes = plt.subplots(1, 2, figsize=(10, 4), dpi=150)
    for ax, vals, title, col in [(axes[0], mus, "肌肉量 (kg)", "#43a047"), (axes[1], fat, "脂肪量 (kg)", "#fb8c00")]:
        b = ax.bar(labels, vals, color=col)
        ax.bar_label(b, fmt="%.1f", fontsize=9)
        ax.set_title(f"{title}｜{last['date']:%Y-%m-%d}")
        ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(CHARTS / "segments.png")
    plt.close(fig)


def chart_weekly_sets(wk):
    week = wk.index[-1]
    r = wk.loc[week]
    fig, ax = plt.subplots(figsize=(10, 4.2), dpi=150)
    for i, (m, (lo, hi)) in enumerate(CFG["weekly_set_targets"].items()):
        ax.add_patch(Rectangle((i - 0.4, lo), 0.8, hi - lo, color="#c8e6c9", zorder=0))
        v = r.get(f"sets_{m}", 0)
        col = "#e53935" if v < lo else ("#fb8c00" if v > hi else "#43a047")
        ax.bar(i, v, width=0.5, color=col, zorder=2)
        ax.text(i, v + 0.3, f"{v:g}", ha="center", fontsize=9)
    ax.set_xticks(range(len(MUSCLES)), MUSCLES)
    ax.set_ylabel("有效組數")
    tag = "（本週進行中）" if week >= current_week() else ""
    ax.set_title(f"{week}{tag} 各肌群有效組數（綠底＝目標範圍）")
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(CHARTS / "weekly_sets.png")
    plt.close(fig)


def chart_load(wk):
    fig, ax1 = plt.subplots(figsize=(10, 4), dpi=150)
    x = range(len(wk))
    ax1.bar(x, wk["load"], color="#90caf9", label="訓練負荷（時長×sRPE）")
    ax1.set_ylabel("訓練負荷")
    ax2 = ax1.twinx()
    ax2.plot(x, wk["jumps"], "-o", color="#d84315", label="跳躍次數")
    ax2.set_ylabel("跳躍次數")
    ax1.set_xticks(list(x), wk.index, rotation=30)
    ax1.set_title("每週訓練負荷與跳躍次數")
    h1, l1 = ax1.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax1.legend(h1 + h2, l1 + l2, loc="upper left", fontsize=9)
    fig.tight_layout()
    fig.savefig(CHARTS / "weekly_load.png")
    plt.close(fig)


def chart_strength(st):
    fig, ax = plt.subplots(figsize=(10, 4.5), dpi=150)
    for ex, g in st.groupby("exercise"):
        ax.plot(g["date"], g["e1rm"], "-o", label=ex, ms=4)
    ax.set_ylabel("推估 1RM (kg)")
    ax.set_title("主要動作力量趨勢（e1RM）")
    ax.legend(fontsize=9, ncol=3)
    ax.grid(alpha=0.25)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(CHARTS / "strength.png")
    plt.close(fig)


def chart_weight(w):
    fig, ax = plt.subplots(figsize=(10, 4), dpi=150)
    ax.plot(w["date"], w["weight_kg"], "o", color="#90a4ae", ms=4, label="每日")
    ax.plot(w["date"], w["ma7"], "-", color="#1565c0", lw=2, label="7 日平均")
    ax.set_ylabel("體重 (kg)")
    ax.set_title("空腹體重趨勢")
    ax.legend()
    ax.grid(alpha=0.25)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(CHARTS / "weight.png")
    plt.close(fig)


def chart_jump(j):
    target = CFG["jump"]["target_reach_cm"]
    fig, ax = plt.subplots(figsize=(10, 4), dpi=150)
    jj = j.dropna(subset=["approach_reach_cm"])
    ax.plot(jj["date"], jj["approach_reach_cm"], "-o", color="#6a1b9a", label="助跑摸高")
    ax.axhline(target, color="#2e7d32", ls="--", label=f"目標 {target} cm")
    ax.set_ylabel("cm")
    ax.set_title("助跑摸高進度")
    ax.legend()
    ax.grid(alpha=0.25)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(CHARTS / "jump.png")
    plt.close(fig)


# ---------------------------------------------------------------- 儀表板
def pct(x):
    return max(0.0, min(100.0, x * 100))


def body_section(sc):
    t = CFG["body_targets"]
    base, last = sc.iloc[0], sc.iloc[-1]
    target_ffm = t["ffmi_min"] * HEIGHT_M**2
    need_ffm = max(0.0, target_ffm - last["ffm_kg"])
    target_fm_at = lambda ffm, bf: ffm / (1 - bf / 100) - ffm  # noqa: E731
    need_fm = max(0.0, last["fat_mass_kg"] - target_fm_at(max(last["ffm_kg"], target_ffm), t["bf_max"]))
    ffm_prog = pct((last["ffm_kg"] - base["ffm_kg"]) / (target_ffm - base["ffm_kg"])) if target_ffm > base["ffm_kg"] else 100
    bf_prog = pct((base["bf_pct"] - last["bf_pct"]) / (base["bf_pct"] - t["bf_max"])) if base["bf_pct"] > t["bf_max"] else 100
    in_zone = (t["bf_min"] <= last["bf_pct"] <= t["bf_max"]) and (t["ffmi_min"] <= last["ffmi"] <= t["ffmi_max"])
    end_w = max(last["ffm_kg"], target_ffm) / (1 - (t["bf_min"] + t["bf_max"]) / 200)
    lines = ["## 1. 薄肌目標", "",
             f"最新掃描 {last['date']:%Y-%m-%d}（共 {len(sc)} 次掃描）", "",
             "| 指標 | 基準 | 最新 | 目標 | 進度 |", "|---|---|---|---|---|",
             f"| 體脂率 | {base['bf_pct']:.1f}% | {last['bf_pct']:.1f}% | {t['bf_min']:g}–{t['bf_max']:g}% | {bf_prog:.0f}% |",
             f"| 去脂體重 FFM | {base['ffm_kg']:.1f} kg | {last['ffm_kg']:.1f} kg | ≥ {target_ffm:.1f} kg | {ffm_prog:.0f}% |",
             f"| FFMI | {base['ffmi']:.2f} | {last['ffmi']:.2f} | {t['ffmi_min']:g}–{t['ffmi_max']:g} | — |",
             f"| 脂肪量 | {base['fat_mass_kg']:.1f} kg | {last['fat_mass_kg']:.1f} kg | 約 {target_fm_at(target_ffm, (t['bf_min'] + t['bf_max']) / 2):.1f} kg | — |",
             f"| 體重 | {base['weight_kg']:.1f} kg | {last['weight_kg']:.1f} kg | 約 {end_w:.1f} kg | — |",
             f"| 內臟脂肪 | {base['visceral_fat']:g} | {last['visceral_fat']:g} | 維持低檔 | — |", "",
             f"- 距離目標還差：**去脂體重 +{need_ffm:.1f} kg**、**脂肪 −{need_fm:.1f} kg**（到體脂 {t['bf_max']:g}%；"
             f"到 {(t['bf_min'] + t['bf_max']) / 2:g}% 需 −{max(0.0, last['fat_mass_kg'] - target_fm_at(max(last['ffm_kg'], target_ffm), (t['bf_min'] + t['bf_max']) / 2)):.1f} kg）",
             f"- 目前狀態：{'已在目標區內' if in_zone else '尚未進入目標區'}（達標規則：{t['achieve_rule']}）",
             f"- 左右平衡：手臂 右比左多 {last['arm_asym_pct']:.1f}%，腿 右比左多 {last['leg_asym_pct']:.1f}%", ""]
    now = pd.Timestamp(today())
    lines += ["| 里程碑 | 期限 | 去脂體重 | 體脂率 | 狀態 |", "|---|---|---|---|---|"]
    for ms in CFG["milestones"]:
        ok = last["ffm_kg"] >= ms["ffm_min_kg"] and last["bf_pct"] <= ms["bf_max"]
        st = "已達成" if ok else ("已過期限" if now > pd.Timestamp(ms["by"]) else "進行中")
        lines.append(f"| {ms['name']} | {ms['by']} | ≥ {ms['ffm_min_kg']} kg | ≤ {ms['bf_max']}% | {st} |")
    lines += ["", "![身體組成地圖](../charts/body_map.png)", "", "![分段肌肉與脂肪](../charts/segments.png)", ""]
    flags = []
    days = (now - last["date"]).days
    if days > 35:
        flags.append(f"距離上次掃描已 {days} 天，建議這週用同一台 Boditrax 再掃一次（空腹、早上、訓練前）")
    return lines, flags


def jump_section():
    j = read("jump_tests")
    target = CFG["jump"]["target_reach_cm"]
    lines = ["## 2. 助跑摸高目標", ""]
    if j.empty or j["approach_reach_cm"].dropna().empty:
        lines += [f"- 目標：助跑摸高 **{target} cm**", "- 尚無測試紀錄，需要先量：站立摸高、助跑摸高（最佳 3 次）", ""]
        return lines, ["還沒有跳躍基準數據，請量站立摸高與助跑摸高"]
    j["date"] = pd.to_datetime(j["date"])
    j = j.sort_values("date")
    jj = j.dropna(subset=["approach_reach_cm"])
    base, last = jj.iloc[0], jj.iloc[-1]
    sr = j["standing_reach_cm"].dropna()
    sr_v = float(sr.iloc[-1]) if not sr.empty else None
    prog = pct((last["approach_reach_cm"] - base["approach_reach_cm"]) / (target - base["approach_reach_cm"])) if target > base["approach_reach_cm"] else 100
    lines += ["| 指標 | 基準 | 最新 | 目標 |", "|---|---|---|---|",
              f"| 助跑摸高 | {base['approach_reach_cm']:g} cm | {last['approach_reach_cm']:g} cm | {target} cm |"]
    if sr_v:
        lines.append(f"| 助跑跳躍高度 | {base['approach_reach_cm'] - sr_v:g} cm | {last['approach_reach_cm'] - sr_v:g} cm | {target - sr_v:g} cm |")
    lines += ["", f"- 還差 **{target - last['approach_reach_cm']:g} cm**，進度 {prog:.0f}%", "", "![助跑摸高進度](../charts/jump.png)", ""]
    chart_jump(j)
    return lines, []


def cmd_report(_args=None):
    CHARTS.mkdir(exist_ok=True)
    REPORTS.mkdir(exist_ok=True)
    out = [f"# 訓練追蹤儀表板", "", f"更新時間：{datetime.now(TZ):%Y-%m-%d %H:%M}", ""]
    flags = []
    sc = scans_df()
    if not sc.empty:
        chart_body_map(sc)
        chart_segments(sc)
        l, f = body_section(sc)
        out += l
        flags += f
    l, f = jump_section()
    out += l
    flags += f
    wk = weekly_table()
    out += ["## 3. 訓練", ""]
    if wk.empty:
        out += ["- 尚無訓練紀錄", ""]
    else:
        weeks = [wk.index[-1]]
        if wk.index[-1] >= current_week() and len(wk) > 1:
            weeks.append(wk.index[-2])
        for w_ in weeks:
            txt, f = week_summary(w_)
            out += [txt, ""]
            flags += [f"{w_}：{x}" for x in f]
        chart_weekly_sets(wk)
        chart_load(wk)
        out += ["![每週有效組數](../charts/weekly_sets.png)", "", "![每週負荷](../charts/weekly_load.png)", ""]
        st = strength_trends()
        if not st.empty:
            chart_strength(st)
            out += ["![力量趨勢](../charts/strength.png)", ""]
    w = read("daily_weight")
    if not w.empty:
        w["date"] = pd.to_datetime(w["date"])
        w = w.sort_values("date")
        w["ma7"] = w.rolling("7D", on="date")["weight_kg"].mean()
        chart_weight(w)
        out += ["## 4. 體重", "", f"- 最新 7 日平均：{w['ma7'].iloc[-1]:.1f} kg", "", "![體重趨勢](../charts/weight.png)", ""]
    n = read("nutrition")
    if not n.empty:
        n["date"] = pd.to_datetime(n["date"])
        recent = n[n["date"] >= n["date"].max() - pd.Timedelta(days=6)]
        out += ["## 5. 飲食（近 7 天）", "",
                f"- 平均熱量 {recent['kcal'].mean():.0f} kcal，平均蛋白質 {recent['protein_g'].mean():.0f} g", ""]
    out += ["## 自動提醒", ""] + ([f"- {x}" for x in flags] or ["- 無"]) + [""]
    (REPORTS / "dashboard.md").write_text("\n".join(out), encoding="utf-8")
    print("\n".join(out))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("add-session"); p.add_argument("file"); p.set_defaults(fn=cmd_add_session)
    p = sub.add_parser("add-weight"); p.add_argument("date"); p.add_argument("kg", type=float)
    p.add_argument("--not-fasted", action="store_true"); p.add_argument("--notes"); p.set_defaults(fn=cmd_add_weight)
    p = sub.add_parser("add-jump"); p.add_argument("date"); p.add_argument("--standing", type=float)
    p.add_argument("--approach", type=float); p.add_argument("--cmj", type=float); p.add_argument("--notes")
    p.set_defaults(fn=cmd_add_jump)
    p = sub.add_parser("add-scan"); p.add_argument("file"); p.set_defaults(fn=cmd_add_scan)
    p = sub.add_parser("add-food"); p.add_argument("date"); p.add_argument("--kcal", type=float)
    p.add_argument("--protein", type=float); p.add_argument("--notes"); p.set_defaults(fn=cmd_add_food)
    p = sub.add_parser("session"); p.add_argument("sid"); p.set_defaults(fn=lambda a: print(session_summary(a.sid)))
    p = sub.add_parser("week"); p.add_argument("week", nargs="?")
    p.set_defaults(fn=lambda a: print(week_summary(a.week)[0]))
    p = sub.add_parser("report"); p.set_defaults(fn=cmd_report)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
