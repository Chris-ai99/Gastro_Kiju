import clsx from "clsx";

type ProgressStepsProps = {
  steps: string[];
  currentStep: string;
};

export const ProgressSteps = ({ steps, currentStep }: ProgressStepsProps) => (
  <div className="kiju-steps" role="list" aria-label="Bestellschritte">
    {steps.map((step, index) => (
      <div
        key={step}
        className={clsx("kiju-step", {
          "kiju-step--active": step === currentStep,
          "kiju-step--done": steps.indexOf(currentStep) > index
        })}
        role="listitem"
      >
        <span>{index + 1}</span>
        <strong>{step}</strong>
      </div>
    ))}
  </div>
);
