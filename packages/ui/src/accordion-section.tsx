import type { PropsWithChildren, ReactNode } from "react";

import clsx from "clsx";

type AccordionSectionProps = PropsWithChildren<{
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  tone?: "default" | "info" | "alert" | "success";
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
}>;

export const AccordionSection = ({
  title,
  eyebrow,
  action,
  tone = "default",
  className,
  contentClassName,
  defaultOpen = true,
  children
}: AccordionSectionProps) => (
  <details className={clsx("kiju-accordion", className)} open={defaultOpen}>
    <summary className={clsx("kiju-card", `kiju-card--${tone}`, "kiju-accordion__summary")}>
      <div className="kiju-accordion__summary-copy">
        {eyebrow ? <span className="kiju-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      <div className="kiju-accordion__summary-actions">
        {action}
        <span className="kiju-accordion__chevron" aria-hidden="true">
          v
        </span>
      </div>
    </summary>
    <div
      className={clsx("kiju-card", `kiju-card--${tone}`, "kiju-accordion__content", contentClassName)}
    >
      {children}
    </div>
  </details>
);
