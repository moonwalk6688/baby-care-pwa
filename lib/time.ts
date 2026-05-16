export function babyDay(birthAt: string) {
  const start = new Date(birthAt).getTime();
  const diff = Date.now() - start;
  return Math.max(1, Math.floor(diff / 86400000) + 1);
}

export function sinceText(iso?: string) {
  if (!iso) return "还没有记录";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function minutesText(minutes = 0) {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function datetimeLocalValue(iso?: string) {
  const date = iso ? new Date(iso) : new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}

export function sameLocalDay(iso: string, day = new Date()) {
  const date = new Date(iso);
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

export function formatClock(iso?: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(iso));
}
