import type { PropsWithChildren, ReactNode } from "react";

import clsx from "clsx";

type SectionCardProps = PropsWithChildren<{
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  tone?: "default" | "info" | "alert" | "success";
  className?: string;
}>;

export const SectionCard = ({
  title,
  eyebrow,
  action,
  tone = "default",
  className,
  children
}: SectionCardProps) => (
  <section
    className={clsx("kiju-card", `kiju-card--${tone}`, className)}
    style={{
      display: "grid",
      gap: "1rem"
    }}
  >
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "1rem"
      }}
    >
      <div style={{ display: "grid", gap: "0.35rem" }}>
        {eyebrow ? <span className="kiju-eyebrow">{eyebrow}</span> : null}
        <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>{title}</h2>
      </div>
      {action}
    </header>
    {children}
  </section>
);
