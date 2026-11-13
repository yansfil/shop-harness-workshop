import { Icon } from "./icon.tsx";

const stepButton =
  "flex size-9 items-center justify-center rounded-md border border-layer-edge bg-ground text-ink disabled:bg-canvas disabled:text-layer-edge focus-visible:outline-2 focus-visible:outline-ink";

/** 수량 − 숫자 +. max는 재고 한도다. */
export function QuantityStepper({
  value,
  max,
  min = 1,
  disabled = false,
  label,
  onChange,
}: {
  value: number;
  max: number;
  min?: number;
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <div role="group" aria-label={`${label} 수량`} className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`${label} 수량 줄이기`}
        disabled={disabled || value <= min}
        onClick={() => {
          onChange(value - 1);
        }}
        className={stepButton}
      >
        <Icon name="remove" className="size-5" />
      </button>
      <output aria-label={`${label} 수량`} className="w-10 text-center text-sm font-bold text-ink">
        {value}
      </output>
      <button
        type="button"
        aria-label={`${label} 수량 늘리기`}
        disabled={disabled || value >= max}
        onClick={() => {
          onChange(value + 1);
        }}
        className={stepButton}
      >
        <Icon name="add" className="size-5" />
      </button>
    </div>
  );
}
