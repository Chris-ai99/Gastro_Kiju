import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
};

export const MetricCard = ({ label, value, detail, icon }: MetricCardProps) => (
  <article className="kiju-metric-card">
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <span className="kiju-eyebrow">{label}</span>
      {icon}
    </div>
    <strong style={{ fontSize: "1.7rem", lineHeight: 1.1 }}>{value}</strong>
    {detail ? <span style={{ color: "#475569", fontSize: "0.95rem" }}>{detail}</span> : null}
  </article>
);
