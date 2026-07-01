export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "--:--";
  const total = Math.round(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function shortCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 10000) return `${Math.round(value / 1000) / 10}万`;
  return String(value);
}

