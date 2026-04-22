import clsx from "clsx";

type ProgressStepsProps = {
  steps: string[];
  currentStep: string;
  onStepSelect?: (step: string) => void;
};

export const ProgressSteps = ({ steps, currentStep, onStepSelect }: ProgressStepsProps) => (
  <div className="kiju-steps" role="list" aria-label="Bestellschritte">
    {steps.map((step, index) => {
      const className = clsx("kiju-step", {
        "kiju-step--active": step === currentStep,
        "kiju-step--done": steps.indexOf(currentStep) > index,
        "kiju-step--button": Boolean(onStepSelect)
      });
      const content = (
        <>
          <span>{index + 1}</span>
          <strong>{step}</strong>
        </>
      );

      return onStepSelect ? (
        <button
          key={step}
          type="button"
          className={className}
          onClick={() => onStepSelect(step)}
          aria-current={step === currentStep ? "step" : undefined}
        >
          {content}
        </button>
      ) : (
        <div key={step} className={className} role="listitem">
          {content}
        </div>
      );
    })}
  </div>
);
