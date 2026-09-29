/**
 * Built-in exercise library. Keys are stable identifiers stored in workout_sets;
 * never rename a key once data may reference it (add a new one instead).
 */

export const DAY_TYPES = ["leg", "back", "chest"] as const;
export type StrengthDay = (typeof DAY_TYPES)[number];
export type SessionType = StrengthDay | "volleyball" | "other";

export const SESSION_LABEL: Record<SessionType, string> = {
  leg: "腿日",
  back: "背日",
  chest: "胸日",
  volleyball: "排球",
  other: "其他",
};

/** Muscle groups with weekly set targets (order used in charts). */
export const TARGET_MUSCLES = [
  "胸",
  "背",
  "肩",
  "二頭",
  "三頭",
  "核心",
  "股四頭",
  "腿後",
  "臀",
  "小腿",
] as const;
/** Extra groups that can be tagged but have no weekly target. */
export const EXTRA_MUSCLES = ["前臂", "內收", "脛前"] as const;
export const ALL_MUSCLES = [...TARGET_MUSCLES, ...EXTRA_MUSCLES] as const;
export type Muscle = (typeof ALL_MUSCLES)[number];

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "kettlebell"
  | "band"
  | "other";

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "槓鈴",
  dumbbell: "啞鈴",
  machine: "器械",
  cable: "纜繩",
  bodyweight: "徒手",
  kettlebell: "壺鈴",
  band: "彈力帶",
  other: "其他",
};

export type Category =
  | "compound"
  | "isolation"
  | "power"
  | "plyo"
  | "core"
  | "prehab";

export const CATEGORY_LABEL: Record<Category, string> = {
  compound: "複合",
  isolation: "孤立",
  power: "爆發力",
  plyo: "增強式跳躍",
  core: "核心",
  prehab: "肩部保養",
};

export type ExerciseUnit = "reps" | "sec";

export interface ExerciseDef {
  key: string;
  name: string;
  days: StrengthDay[];
  primary: Muscle[];
  secondary: Muscle[];
  equipment: Equipment;
  category: Category;
  /** Share of bodyweight moved; 0 for externally loaded exercises. */
  bwFactor: number;
  unit: ExerciseUnit;
  /** Weight entered is assistance (subtracted from bodyweight). */
  assisted?: boolean;
  /** Section heading used when browsing the library. */
  group: string;
  aliases?: string[];
  custom?: boolean;
  archived?: boolean;
}

type Spec = [
  key: string,
  name: string,
  equipment: Equipment,
  category: Category,
  primary: Muscle[],
  secondary: Muscle[],
  extra?: Partial<Pick<ExerciseDef, "bwFactor" | "unit" | "assisted" | "aliases">>,
];

function section(days: StrengthDay[], group: string, specs: Spec[]): ExerciseDef[] {
  return specs.map(([key, name, equipment, category, primary, secondary, extra]) => ({
    key,
    name,
    days,
    group,
    equipment,
    category,
    primary,
    secondary,
    bwFactor: extra?.bwFactor ?? 0,
    unit: extra?.unit ?? "reps",
    assisted: extra?.assisted,
    aliases: extra?.aliases,
  }));
}

const LEG: StrengthDay[] = ["leg"];
const BACK: StrengthDay[] = ["back"];
const CHEST: StrengthDay[] = ["chest"];
const ALL: StrengthDay[] = ["leg", "back", "chest"];

export const EXERCISES: ExerciseDef[] = [
  // ─────────────── 腿日 ───────────────
  ...section(LEG, "蹲類", [
    ["back_squat", "槓鈴背蹲舉", "barbell", "compound", ["股四頭", "臀"], ["腿後", "核心"], { aliases: ["深蹲", "back squat"] }],
    ["front_squat", "前蹲舉", "barbell", "compound", ["股四頭"], ["臀", "核心"], { aliases: ["front squat"] }],
    ["goblet_squat", "高腳杯深蹲", "dumbbell", "compound", ["股四頭"], ["臀", "核心"], { aliases: ["goblet"] }],
    ["smith_squat", "史密斯深蹲", "machine", "compound", ["股四頭", "臀"], ["腿後"]],
    ["hack_squat", "哈克深蹲", "machine", "compound", ["股四頭"], ["臀"], { aliases: ["hack"] }],
    ["leg_press", "腿推機", "machine", "compound", ["股四頭", "臀"], ["腿後"], { aliases: ["腿推", "leg press"] }],
    ["box_squat", "箱上深蹲", "barbell", "compound", ["股四頭", "臀"], ["腿後", "核心"]],
    ["pause_squat", "暫停深蹲", "barbell", "compound", ["股四頭", "臀"], ["核心"]],
    ["ssb_squat", "安全槓深蹲", "barbell", "compound", ["股四頭", "臀"], ["背", "核心"], { aliases: ["SSB"] }],
    ["sissy_squat", "西西里深蹲", "bodyweight", "isolation", ["股四頭"], [], { bwFactor: 0.5, aliases: ["sissy"] }],
  ]),
  ...section(LEG, "髖鉸鏈", [
    ["deadlift", "傳統硬舉", "barbell", "compound", ["臀", "腿後"], ["背", "股四頭", "核心"], { aliases: ["硬舉", "deadlift"] }],
    ["sumo_deadlift", "相撲硬舉", "barbell", "compound", ["臀", "股四頭"], ["腿後", "背"], { aliases: ["sumo"] }],
    ["trap_bar_deadlift", "六角槓硬舉", "barbell", "compound", ["股四頭", "臀"], ["腿後", "背"], { aliases: ["trap bar", "hex bar"] }],
    ["rdl", "槓鈴羅馬尼亞硬舉", "barbell", "compound", ["腿後", "臀"], ["背"], { aliases: ["RDL", "羅馬尼亞"] }],
    ["db_rdl", "啞鈴羅馬尼亞硬舉", "dumbbell", "compound", ["腿後", "臀"], ["背"], { aliases: ["RDL"] }],
    ["sl_rdl", "單腳羅馬尼亞硬舉", "dumbbell", "compound", ["腿後", "臀"], ["核心"], { aliases: ["單腿 RDL"] }],
    ["good_morning", "早安式", "barbell", "compound", ["腿後"], ["臀", "背"]],
    ["back_extension", "45 度背伸展", "bodyweight", "isolation", ["臀", "腿後"], ["背"], { bwFactor: 0.5, aliases: ["羅馬椅", "背伸展"] }],
    ["reverse_hyper", "反向髖伸", "machine", "isolation", ["臀"], ["腿後"]],
    ["kb_swing", "壺鈴擺盪", "kettlebell", "power", ["臀", "腿後"], ["核心"], { aliases: ["swing"] }],
  ]),
  ...section(LEG, "單腳動作", [
    ["bulgarian_split_squat", "保加利亞分腿蹲", "dumbbell", "compound", ["股四頭", "臀"], ["腿後"], { aliases: ["BSS", "保加利亞"] }],
    ["split_squat", "分腿蹲", "dumbbell", "compound", ["股四頭", "臀"], []],
    ["forward_lunge", "前跨弓箭步", "dumbbell", "compound", ["股四頭", "臀"], ["腿後"], { aliases: ["弓箭步", "lunge"] }],
    ["reverse_lunge", "後跨弓箭步", "dumbbell", "compound", ["臀", "股四頭"], ["腿後"], { aliases: ["弓箭步"] }],
    ["walking_lunge", "行走弓箭步", "dumbbell", "compound", ["股四頭", "臀"], ["腿後"], { aliases: ["弓箭步"] }],
    ["lateral_lunge", "側弓箭步", "dumbbell", "compound", ["臀", "股四頭"], ["內收"]],
    ["step_up", "登階", "dumbbell", "compound", ["股四頭", "臀"], [], { aliases: ["step up"] }],
    ["box_pistol", "單腳蹲（箱上）", "bodyweight", "compound", ["股四頭", "臀"], ["核心"], { bwFactor: 0.8, aliases: ["pistol"] }],
  ]),
  ...section(LEG, "器械與孤立", [
    ["leg_extension", "腿伸展", "machine", "isolation", ["股四頭"], []],
    ["seated_leg_curl", "坐姿腿彎舉", "machine", "isolation", ["腿後"], [], { aliases: ["腿彎舉"] }],
    ["lying_leg_curl", "俯臥腿彎舉", "machine", "isolation", ["腿後"], [], { aliases: ["腿彎舉"] }],
    ["nordic_curl", "北歐腿彎舉", "bodyweight", "isolation", ["腿後"], [], { bwFactor: 0.5, aliases: ["nordic"] }],
    ["reverse_nordic", "反向北歐", "bodyweight", "isolation", ["股四頭"], [], { bwFactor: 0.4 }],
    ["hip_thrust", "槓鈴臀推", "barbell", "compound", ["臀"], ["腿後"], { aliases: ["臀推", "hip thrust"] }],
    ["machine_hip_thrust", "機械臀推", "machine", "compound", ["臀"], ["腿後"], { aliases: ["臀推"] }],
    ["glute_bridge", "臀橋", "barbell", "isolation", ["臀"], ["腿後"]],
    ["hip_abduction", "髖外展機", "machine", "isolation", ["臀"], [], { aliases: ["外展"] }],
    ["hip_adduction", "髖內收機", "machine", "isolation", ["內收"], [], { aliases: ["內收"] }],
    ["cable_kickback", "纜繩後踢", "cable", "isolation", ["臀"], []],
    ["copenhagen_plank", "哥本哈根側棒式", "bodyweight", "isolation", ["內收"], ["核心"], { unit: "sec", aliases: ["copenhagen"] }],
  ]),
  ...section(LEG, "小腿與脛前", [
    ["standing_calf_raise", "站姿提踵", "machine", "isolation", ["小腿"], [], { aliases: ["提踵", "calf"] }],
    ["seated_calf_raise", "坐姿提踵", "machine", "isolation", ["小腿"], [], { aliases: ["提踵"] }],
    ["leg_press_calf_raise", "腿推機提踵", "machine", "isolation", ["小腿"], [], { aliases: ["提踵"] }],
    ["single_leg_calf_raise", "單腳提踵", "dumbbell", "isolation", ["小腿"], [], { bwFactor: 1.0, aliases: ["提踵"] }],
    ["tibialis_raise", "脛前肌抬腳", "other", "isolation", ["脛前"], [], { aliases: ["tib raise"] }],
  ]),
  ...section(LEG, "爆發力", [
    ["power_clean", "爆發上膊", "barbell", "power", ["臀", "腿後"], ["背", "股四頭"], { aliases: ["上膊", "clean"] }],
    ["hang_clean", "懸垂上膊", "barbell", "power", ["臀", "腿後"], ["背", "股四頭"], { aliases: ["上膊"] }],
    ["power_snatch", "爆發抓舉", "barbell", "power", ["臀", "腿後"], ["肩", "背"], { aliases: ["抓舉", "snatch"] }],
    ["hang_snatch", "懸垂抓舉", "barbell", "power", ["臀", "腿後"], ["肩", "背"], { aliases: ["抓舉"] }],
    ["jump_squat", "負重跳躍蹲", "barbell", "power", ["股四頭", "臀"], [], { aliases: ["jump squat"] }],
    ["trap_bar_jump", "六角槓跳", "barbell", "power", ["股四頭", "臀"], []],
    ["mb_backward_throw", "藥球後拋", "other", "power", ["臀"], ["腿後", "背"], { aliases: ["藥球"] }],
  ]),
  ...section(LEG, "增強式跳躍", [
    ["box_jump", "箱跳", "bodyweight", "plyo", [], [], { aliases: ["box jump"] }],
    ["sl_box_jump", "單腳箱跳", "bodyweight", "plyo", [], []],
    ["depth_jump", "深跳", "bodyweight", "plyo", [], [], { aliases: ["跳深", "depth"] }],
    ["drop_landing", "落地緩衝", "bodyweight", "plyo", [], [], { aliases: ["drop landing"] }],
    ["cmj", "原地反向跳", "bodyweight", "plyo", [], [], { aliases: ["CMJ", "垂直跳"] }],
    ["approach_jump", "助跑摸高跳", "bodyweight", "plyo", [], [], { aliases: ["助跑跳", "摸高"] }],
    ["hurdle_hops", "連續跳欄", "bodyweight", "plyo", [], [], { aliases: ["hurdle"] }],
    ["broad_jump", "立定跳遠", "bodyweight", "plyo", [], []],
    ["pogo", "彈跳（pogo）", "bodyweight", "plyo", [], [], { aliases: ["pogo"] }],
    ["sl_hop", "單腳彈跳", "bodyweight", "plyo", [], []],
    ["bounding", "交替跨步跳", "bodyweight", "plyo", [], [], { aliases: ["bound"] }],
    ["lateral_bound", "側向跳", "bodyweight", "plyo", [], []],
    ["jump_rope", "跳繩", "bodyweight", "plyo", [], [], { unit: "sec" }],
  ]),

  // ─────────────── 背日 ───────────────
  ...section(BACK, "垂直拉", [
    ["pull_up", "正手引體向上", "bodyweight", "compound", ["背"], ["二頭"], { bwFactor: 1.0, aliases: ["引體", "pull up"] }],
    ["chin_up", "反手引體向上", "bodyweight", "compound", ["背"], ["二頭"], { bwFactor: 1.0, aliases: ["引體", "chin up"] }],
    ["neutral_pull_up", "對握引體向上", "bodyweight", "compound", ["背"], ["二頭"], { bwFactor: 1.0, aliases: ["引體"] }],
    ["weighted_pull_up", "負重引體向上", "bodyweight", "compound", ["背"], ["二頭"], { bwFactor: 1.0, aliases: ["引體"] }],
    ["assisted_pull_up", "輔助引體向上機", "machine", "compound", ["背"], ["二頭"], { bwFactor: 1.0, assisted: true, aliases: ["引體"] }],
    ["wide_lat_pulldown", "寬握滑輪下拉", "cable", "compound", ["背"], ["二頭"], { aliases: ["下拉", "lat pulldown"] }],
    ["close_grip_pulldown", "窄握下拉", "cable", "compound", ["背"], ["二頭"], { aliases: ["下拉"] }],
    ["reverse_grip_pulldown", "反手下拉", "cable", "compound", ["背"], ["二頭"], { aliases: ["下拉"] }],
    ["single_arm_pulldown", "單手滑輪下拉", "cable", "compound", ["背"], ["二頭"], { aliases: ["下拉"] }],
  ]),
  ...section(BACK, "水平拉", [
    ["barbell_row", "槓鈴划船", "barbell", "compound", ["背"], ["二頭", "肩"], { aliases: ["俯身划船", "row"] }],
    ["pendlay_row", "Pendlay 划船", "barbell", "compound", ["背"], ["二頭", "肩"]],
    ["db_row", "啞鈴單手划船", "dumbbell", "compound", ["背"], ["二頭"], { aliases: ["單手划船"] }],
    ["seated_cable_row", "坐姿纜繩划船", "cable", "compound", ["背"], ["二頭"], { aliases: ["坐姿划船", "划船機"] }],
    ["t_bar_row", "T 槓划船", "barbell", "compound", ["背"], ["二頭", "肩"], { aliases: ["T bar"] }],
    ["chest_supported_row", "胸靠划船", "machine", "compound", ["背"], ["二頭", "肩"]],
    ["machine_row", "機械划船", "machine", "compound", ["背"], ["二頭"]],
    ["seal_row", "海豹划船", "barbell", "compound", ["背"], ["二頭", "肩"]],
    ["inverted_row", "反向划船（徒手）", "bodyweight", "compound", ["背"], ["二頭"], { bwFactor: 0.6 }],
    ["meadows_row", "Meadows 划船", "barbell", "compound", ["背"], ["二頭"]],
  ]),
  ...section(BACK, "其他背部", [
    ["straight_arm_pulldown", "直臂下拉", "cable", "isolation", ["背"], []],
    ["db_pullover", "啞鈴仰臥拉舉", "dumbbell", "isolation", ["背"], ["胸"], { aliases: ["pullover"] }],
    ["barbell_shrug", "槓鈴聳肩", "barbell", "isolation", ["背"], [], { aliases: ["聳肩"] }],
    ["db_shrug", "啞鈴聳肩", "dumbbell", "isolation", ["背"], [], { aliases: ["聳肩"] }],
  ]),
  ...section(BACK, "後三角", [
    ["face_pull", "臉拉", "cable", "isolation", ["肩"], ["背"], { aliases: ["face pull"] }],
    ["db_reverse_fly", "啞鈴反向飛鳥", "dumbbell", "isolation", ["肩"], ["背"], { aliases: ["反向飛鳥"] }],
    ["reverse_pec_deck", "反向蝴蝶機", "machine", "isolation", ["肩"], ["背"], { aliases: ["反向飛鳥"] }],
    ["cable_rear_delt_fly", "纜繩後三角飛鳥", "cable", "isolation", ["肩"], ["背"], { aliases: ["反向飛鳥"] }],
  ]),
  ...section(BACK, "二頭與前臂", [
    ["barbell_curl", "槓鈴彎舉", "barbell", "isolation", ["二頭"], ["前臂"], { aliases: ["彎舉", "curl"] }],
    ["ez_curl", "EZ 槓彎舉", "barbell", "isolation", ["二頭"], ["前臂"], { aliases: ["彎舉"] }],
    ["db_curl", "啞鈴彎舉", "dumbbell", "isolation", ["二頭"], [], { aliases: ["彎舉"] }],
    ["hammer_curl", "錘式彎舉", "dumbbell", "isolation", ["二頭"], ["前臂"], { aliases: ["彎舉", "hammer"] }],
    ["incline_db_curl", "上斜啞鈴彎舉", "dumbbell", "isolation", ["二頭"], [], { aliases: ["彎舉"] }],
    ["preacher_curl", "牧師椅彎舉", "barbell", "isolation", ["二頭"], [], { aliases: ["彎舉"] }],
    ["cable_curl", "纜繩彎舉", "cable", "isolation", ["二頭"], [], { aliases: ["彎舉"] }],
    ["bayesian_curl", "貝氏纜繩彎舉", "cable", "isolation", ["二頭"], [], { aliases: ["彎舉", "bayesian"] }],
    ["concentration_curl", "集中彎舉", "dumbbell", "isolation", ["二頭"], [], { aliases: ["彎舉"] }],
    ["spider_curl", "蜘蛛彎舉", "dumbbell", "isolation", ["二頭"], [], { aliases: ["彎舉"] }],
    ["reverse_curl", "反握彎舉", "barbell", "isolation", ["前臂"], ["二頭"]],
    ["wrist_curl", "腕彎舉", "dumbbell", "isolation", ["前臂"], []],
    ["farmers_walk", "農夫走路", "dumbbell", "isolation", ["前臂"], ["核心", "背"], { unit: "sec" }],
  ]),

  // ─────────────── 胸日 ───────────────
  ...section(CHEST, "胸推", [
    ["bench_press", "槓鈴臥推", "barbell", "compound", ["胸"], ["三頭", "肩"], { aliases: ["臥推", "bench"] }],
    ["incline_bench", "上斜槓鈴臥推", "barbell", "compound", ["胸", "肩"], ["三頭"], { aliases: ["上斜臥推", "incline"] }],
    ["decline_bench", "下斜臥推", "barbell", "compound", ["胸"], ["三頭"]],
    ["db_bench", "啞鈴臥推", "dumbbell", "compound", ["胸"], ["三頭", "肩"], { aliases: ["臥推"] }],
    ["incline_db_bench", "上斜啞鈴臥推", "dumbbell", "compound", ["胸", "肩"], ["三頭"], { aliases: ["上斜臥推"] }],
    ["smith_bench", "史密斯臥推", "machine", "compound", ["胸"], ["三頭", "肩"], { aliases: ["臥推"] }],
    ["smith_incline", "史密斯上斜臥推", "machine", "compound", ["胸", "肩"], ["三頭"], { aliases: ["上斜臥推"] }],
    ["machine_chest_press", "機械胸推", "machine", "compound", ["胸"], ["三頭", "肩"], { aliases: ["胸推"] }],
    ["incline_machine_press", "上斜機械胸推", "machine", "compound", ["胸", "肩"], ["三頭"], { aliases: ["胸推"] }],
    ["dips", "雙槓撐體", "bodyweight", "compound", ["胸", "三頭"], ["肩"], { bwFactor: 0.9, aliases: ["dips"] }],
    ["push_up", "伏地挺身", "bodyweight", "compound", ["胸"], ["三頭", "肩"], { bwFactor: 0.65, aliases: ["push up"] }],
    ["weighted_push_up", "負重伏地挺身", "bodyweight", "compound", ["胸"], ["三頭", "肩"], { bwFactor: 0.65, aliases: ["伏地挺身"] }],
  ]),
  ...section(CHEST, "胸部孤立", [
    ["db_fly", "啞鈴飛鳥", "dumbbell", "isolation", ["胸"], [], { aliases: ["飛鳥"] }],
    ["incline_db_fly", "上斜啞鈴飛鳥", "dumbbell", "isolation", ["胸"], ["肩"], { aliases: ["飛鳥"] }],
    ["cable_fly_high", "纜繩夾胸（高位）", "cable", "isolation", ["胸"], [], { aliases: ["夾胸", "cable fly"] }],
    ["cable_fly_mid", "纜繩夾胸（中位）", "cable", "isolation", ["胸"], [], { aliases: ["夾胸"] }],
    ["cable_fly_low", "纜繩夾胸（低位）", "cable", "isolation", ["胸"], ["肩"], { aliases: ["夾胸"] }],
    ["pec_deck", "蝴蝶機夾胸", "machine", "isolation", ["胸"], [], { aliases: ["蝴蝶機", "夾胸"] }],
  ]),
  ...section(CHEST, "肩推", [
    ["ohp", "站姿槓鈴肩推", "barbell", "compound", ["肩"], ["三頭", "核心"], { aliases: ["肩推", "OHP"] }],
    ["seated_db_press", "坐姿啞鈴肩推", "dumbbell", "compound", ["肩"], ["三頭"], { aliases: ["肩推"] }],
    ["machine_shoulder_press", "機械肩推", "machine", "compound", ["肩"], ["三頭"], { aliases: ["肩推"] }],
    ["arnold_press", "阿諾推舉", "dumbbell", "compound", ["肩"], ["三頭"], { aliases: ["肩推"] }],
    ["push_press", "借力推", "barbell", "compound", ["肩"], ["三頭", "股四頭"], { aliases: ["push press"] }],
    ["landmine_press", "地雷管推舉", "barbell", "compound", ["肩"], ["胸", "三頭"], { aliases: ["landmine"] }],
  ]),
  ...section(CHEST, "側、前三角", [
    ["db_lateral_raise", "啞鈴側平舉", "dumbbell", "isolation", ["肩"], [], { aliases: ["側平舉"] }],
    ["cable_lateral_raise", "纜繩側平舉", "cable", "isolation", ["肩"], [], { aliases: ["側平舉"] }],
    ["machine_lateral_raise", "機械側平舉", "machine", "isolation", ["肩"], [], { aliases: ["側平舉"] }],
    ["incline_lateral_raise", "上斜側平舉", "dumbbell", "isolation", ["肩"], [], { aliases: ["側平舉"] }],
    ["front_raise", "前平舉", "dumbbell", "isolation", ["肩"], []],
    ["upright_row", "直立划船", "barbell", "isolation", ["肩"], ["背"]],
    ["y_raise", "Y 字上舉", "dumbbell", "isolation", ["肩"], ["背"]],
  ]),
  ...section(CHEST, "三頭", [
    ["rope_pushdown", "繩索三頭下壓", "cable", "isolation", ["三頭"], [], { aliases: ["三頭下壓", "pushdown"] }],
    ["bar_pushdown", "直槓三頭下壓", "cable", "isolation", ["三頭"], [], { aliases: ["三頭下壓"] }],
    ["single_arm_pushdown", "單手三頭下壓", "cable", "isolation", ["三頭"], [], { aliases: ["三頭下壓"] }],
    ["overhead_cable_ext", "過頭繩索三頭伸展", "cable", "isolation", ["三頭"], [], { aliases: ["過頭三頭"] }],
    ["db_overhead_ext", "啞鈴過頭三頭伸展", "dumbbell", "isolation", ["三頭"], [], { aliases: ["過頭三頭"] }],
    ["skull_crusher", "仰臥三頭伸展", "barbell", "isolation", ["三頭"], [], { aliases: ["法式推舉", "skull crusher"] }],
    ["close_grip_bench", "窄握臥推", "barbell", "compound", ["三頭", "胸"], ["肩"]],
    ["bench_dip", "板凳撐體", "bodyweight", "isolation", ["三頭"], [], { bwFactor: 0.5 }],
    ["triceps_machine", "三頭機", "machine", "isolation", ["三頭"], []],
  ]),

  // ─────────────── 每天可選 ───────────────
  ...section(ALL, "核心", [
    ["hanging_leg_raise", "懸垂舉腿", "bodyweight", "core", ["核心"], [], { aliases: ["舉腿"] }],
    ["hanging_knee_raise", "懸垂屈膝舉腿", "bodyweight", "core", ["核心"], [], { aliases: ["舉腿"] }],
    ["cable_crunch", "滑輪捲腹", "cable", "core", ["核心"], [], { aliases: ["捲腹"] }],
    ["crunch", "捲腹", "bodyweight", "core", ["核心"], []],
    ["reverse_crunch", "反向捲腹", "bodyweight", "core", ["核心"], [], { aliases: ["捲腹"] }],
    ["ab_wheel", "健腹輪", "bodyweight", "core", ["核心"], [], { aliases: ["ab wheel"] }],
    ["plank", "棒式", "bodyweight", "core", ["核心"], [], { unit: "sec", aliases: ["plank"] }],
    ["side_plank", "側棒式", "bodyweight", "core", ["核心"], [], { unit: "sec" }],
    ["dead_bug", "死蟲", "bodyweight", "core", ["核心"], [], { aliases: ["dead bug"] }],
    ["pallof_press", "Pallof 抗旋轉推", "cable", "core", ["核心"], [], { aliases: ["pallof"] }],
    ["cable_woodchop", "纜繩伐木", "cable", "core", ["核心"], [], { aliases: ["伐木"] }],
    ["russian_twist", "俄羅斯轉體", "other", "core", ["核心"], []],
    ["dragon_flag", "龍旗", "bodyweight", "core", ["核心"], []],
    ["v_up", "V 字起身", "bodyweight", "core", ["核心"], []],
  ]),
  ...section(ALL, "肩部保養", [
    ["band_external_rotation", "彈力帶外旋", "band", "prehab", ["肩"], [], { aliases: ["外旋"] }],
    ["cable_external_rotation", "纜繩外旋", "cable", "prehab", ["肩"], [], { aliases: ["外旋"] }],
    ["band_pull_apart", "彈力帶拉開", "band", "prehab", ["肩"], ["背"]],
    ["ytw", "肩胛 Y-T-W", "dumbbell", "prehab", ["肩"], ["背"], { aliases: ["YTW"] }],
    ["side_lying_er", "側臥外旋", "dumbbell", "prehab", ["肩"], [], { aliases: ["外旋"] }],
  ]),
];

export const EXERCISE_MAP: Record<string, ExerciseDef> = Object.fromEntries(
  EXERCISES.map(e => [e.key, e])
);

/** Key prefix for user-defined exercises stored in custom_exercises. */
export const CUSTOM_PREFIX = "custom:";

export function customKey(id: number): string {
  return `${CUSTOM_PREFIX}${id}`;
}

export interface CustomExerciseInput {
  id: number;
  name: string;
  days: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  category: string;
  unit: string;
  bwFactor: number;
  archived?: boolean;
}

export function customToDef(c: CustomExerciseInput): ExerciseDef {
  const days = c.days.filter((d): d is StrengthDay =>
    (DAY_TYPES as readonly string[]).includes(d)
  );
  const muscles = (xs: string[]) =>
    xs.filter((m): m is Muscle => (ALL_MUSCLES as readonly string[]).includes(m));
  return {
    key: customKey(c.id),
    name: c.name,
    days: days.length ? days : [...DAY_TYPES],
    group: "自訂動作",
    primary: muscles(c.primaryMuscles),
    secondary: muscles(c.secondaryMuscles),
    equipment: (c.equipment as Equipment) ?? "other",
    category: (c.category as Category) ?? "isolation",
    unit: c.unit === "sec" ? "sec" : "reps",
    bwFactor: c.bwFactor ?? 0,
    custom: true,
    archived: Boolean(c.archived),
  };
}

/** Weight increment (kg) used by +/- buttons and dropdown steps. */
export function weightStep(equipment: Equipment, dumbbellStep = 2): number {
  switch (equipment) {
    case "dumbbell":
      return dumbbellStep;
    case "kettlebell":
      return 4;
    case "band":
      return 1;
    case "other":
      return 1;
    default:
      return 2.5;
  }
}

/** Upper bound for the weight dropdown by equipment. */
export function weightMax(equipment: Equipment): number {
  switch (equipment) {
    case "barbell":
      return 300;
    case "machine":
      return 400;
    case "cable":
      return 150;
    case "dumbbell":
      return 70;
    case "kettlebell":
      return 48;
    case "bodyweight":
      return 60;
    default:
      return 60;
  }
}

/** Whether the exercise has an external-load field worth showing. */
export function usesWeight(ex: ExerciseDef): boolean {
  if (ex.category === "plyo") return false;
  if (ex.equipment === "band") return false;
  return true;
}

export function exerciseMatches(ex: ExerciseDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (ex.name.toLowerCase().includes(q)) return true;
  return (ex.aliases ?? []).some(a => a.toLowerCase().includes(q));
}
