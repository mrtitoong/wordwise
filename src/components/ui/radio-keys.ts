import type { KeyboardEvent } from "react";

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Phím cho nhóm lựa chọn (role="radiogroup" chứa các nút role="radio"): mũi tên chuyển sang lựa
 * chọn bên cạnh và chọn luôn, Home/End về đầu/cuối – như chuẩn WAI-ARIA. Gắn vào onKeyDown của nhóm.
 */
export function radioGroupKeys(event: KeyboardEvent<HTMLElement>) {
  const step = STEP[event.key];
  if (step === undefined && event.key !== "Home" && event.key !== "End") return;
  const radios = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])'),
  ];
  const index = radios.indexOf(document.activeElement as HTMLElement);
  if (index < 0 || radios.length === 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? radios.length - 1
        : (index + step! + radios.length) % radios.length;
  radios[next]!.focus();
  radios[next]!.click();
}
