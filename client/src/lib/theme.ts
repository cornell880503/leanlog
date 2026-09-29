import type { SessionType } from "@shared/exercises";

export const TYPE_COLOR: Record<SessionType | "rest", string> = {
  leg: "#c6f432",
  back: "#5cc8ff",
  chest: "#ff8a5c",
  volleyball: "#f5d547",
  other: "#b8a4ff",
  rest: "#8a9099",
};

export const TYPE_LABEL: Record<SessionType | "rest", string> = {
  leg: "腿日",
  back: "背日",
  chest: "胸日",
  volleyball: "排球",
  other: "其他",
  rest: "休息",
};

export const LOGO_URL = "/logo-192.png";
