import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

type Variant = "primary" | "secondary";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center rounded-md font-bold text-center whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-on-dark aria-disabled:bg-soldout-bg aria-disabled:text-ink-3 disabled:bg-soldout-bg disabled:text-ink-3",
  secondary:
    "border-2 border-ink bg-ground text-ink aria-disabled:border-layer-edge aria-disabled:text-ink-3 disabled:border-layer-edge disabled:text-ink-3",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs-plus",
  md: "h-12 px-6 text-sm",
  lg: "h-14 px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

export function LinkButton({ variant, size, className, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
