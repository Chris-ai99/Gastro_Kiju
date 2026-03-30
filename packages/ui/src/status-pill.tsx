import clsx from "clsx";

type StatusPillProps = {
  label: string;
  tone?: "navy" | "amber" | "red" | "green" | "slate";
};

export const StatusPill = ({ label, tone = "slate" }: StatusPillProps) => (
  <span className={clsx("kiju-pill", `kiju-pill--${tone}`)}>{label}</span>
);
