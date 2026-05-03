import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns today's date as YYYY-MM-DD */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns current month as YYYY-MM */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Formats a YYYY-MM string to a human-readable Russian month label */
const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  const m = parseInt(month ?? "1", 10) - 1;
  const label = MONTHS_RU[m] ?? ym;
  return `${label} ${year}`;
}

/** Formats a number as a cost string with thousands separator */
export function formatCost(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
