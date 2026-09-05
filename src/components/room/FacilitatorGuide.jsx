import { msg } from "@lingui/core/macro";
import { ArrowRight, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { useModal } from "../../hooks/useModal.js";

const FACILITATOR_GUIDE_STEPS = [
  {
    title: msg`Add the items to estimate`,
    text: msg`Open the item manager and enter one item per line. Arrange them in the order you want to discuss them.`,
    action: msg`Open item manager`,
  },
  {
    title: msg`Invite your team`,
    text: msg`Click Invite people in the header and share the room link. Wait for everyone to appear in the People list.`,
  },
  {
    title: msg`Start the vote`,
    text: msg`Select an item from the estimation queue, or enter a new one, then click Start voting.`,
  },
  {
    title: msg`Wait for the votes`,
    text: msg`The People list shows who has voted. When the team is ready, click Reveal cards.`,
  },
  {
    title: msg`Agree and save`,
    text: msg`Discuss the revealed cards, choose the final estimate, and click Save estimate. Then move to the next item.`,
  },
];

export function FacilitatorGuide({ onClose, onManageItems }) {
  const { t, i18n } = useLingui();
  const [stepIndex, setStepIndex] = useState(0);
  const step = FACILITATOR_GUIDE_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === FACILITATOR_GUIDE_STEPS.length - 1;
  const dialogRef = useModal(onClose);
  const stepCount = FACILITATOR_GUIDE_STEPS.length;
  const stepNumber = stepIndex + 1;

  return (
    <div className="workspace-backdrop guide-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="facilitator-guide-title"
        aria-modal="true"
        className="facilitator-guide"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow"><Trans>Facilitator tutorial</Trans></p>
            <h2 id="facilitator-guide-title"><Trans>Run your first planning session</Trans></h2>
          </div>
          <button className="workspace-close" onClick={onClose} type="button" aria-label={t`Close guide`}><X size={17} aria-hidden="true" /></button>
        </header>
        <div className="tutorial-progress">
          <span><Trans>Step {stepNumber} of {stepCount}</Trans></span>
          <div>
            {FACILITATOR_GUIDE_STEPS.map((item, index) => (
              <i className={index <= stepIndex ? "active" : ""} key={index} />
            ))}
          </div>
        </div>
        <section className="tutorial-step">
          <span className="tutorial-number">{String(stepIndex + 1).padStart(2, "0")}</span>
          <h3>{i18n._(step.title)}</h3>
          <p>{i18n._(step.text)}</p>
          {step.action && (
            <button className="tutorial-action" onClick={onManageItems} type="button">
              {i18n._(step.action)} <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
        </section>
        <footer>
          <button
            className="secondary-button"
            disabled={isFirst}
            onClick={() => setStepIndex((index) => index - 1)}
            type="button"
          >
            <Trans>Back</Trans>
          </button>
          <button
            className="primary-button"
            onClick={isLast ? onClose : () => setStepIndex((index) => index + 1)}
            type="button"
          >
            {isLast ? <Trans>Finish</Trans> : <Trans>Next</Trans>}
          </button>
        </footer>
      </section>
    </div>
  );
}
