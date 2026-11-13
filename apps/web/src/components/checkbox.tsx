import { Icon } from "./icon.tsx";

/** 네모 체크박스. 글자는 곁에 label로 둔다. */
export function Checkbox({
  checked,
  disabled = false,
  label,
  onChange,
  visibleLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  /** true면 label을 눈에 보이는 글자로도 쓴다 */
  visibleLabel?: boolean;
}) {
  return (
    <label className={`flex items-center gap-3 text-sm text-ink ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={visibleLabel === true ? undefined : label}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-sm border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
          disabled ? "border-layer-edge bg-canvas" : checked ? "border-ink bg-ink text-on-dark" : "border-ink bg-ground"
        }`}
      >
        {checked && !disabled && <Icon name="check" className="size-4" />}
      </span>
      {visibleLabel === true && label}
    </label>
  );
}
