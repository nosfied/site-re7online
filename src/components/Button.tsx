import React from "react";

type Variant = "primary" | "secondary" | "ghost";

export default function Button({
  children,
  href,
  onClick,
  variant = "primary",
  className = "",
  type = "button",
  target,
  rel,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: Variant;
  className?: string;
  type?: "button" | "submit";
  target?: string;
  rel?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-re7-sky/50 focus-visible:ring-offset-2 focus-visible:ring-offset-re7-navy";

  const styles: Record<Variant, string> = {
    primary:
      "bg-re7-orange text-white hover:bg-re7-amber shadow-lg shadow-re7-orange/20",
    secondary:
      "bg-white/10 text-white hover:bg-white/20 border border-white/15",
    ghost: "bg-transparent text-white/80 hover:text-white hover:bg-white/10 border border-white/10",
  };

  const cls = `${base} ${styles[variant]} ${className}`;

  if (href) {
    return (
      <a href={href} className={cls} target={target} rel={rel}>
        {children}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={cls} type={type}>
      {children}
    </button>
  );
}
