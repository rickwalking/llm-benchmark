export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function secondsUntil(value: string | null): number {
  if (!value) {
    return 0;
  }
  return Math.max(0, Math.floor((new Date(value).getTime() - Date.now()) / 1000));
}

export function formatCountdown(value: string | null): string {
  const total = secondsUntil(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function availabilityText(available: number, total: number, queueDepth: number): string {
  if (available === 0) {
    return `All copies on loan — ${queueDepth} waiting`;
  }
  return `${available} of ${total} available`;
}

export function dueDateFromToday(): string {
  const due = new Date();
  due.setDate(due.getDate() + 14);
  return due.toISOString();
}
