import { Trans, useLingui } from "@lingui/react/macro";
import { Coffee, X } from "lucide-react";
import { useState } from "react";
import { dismissSupportBanner, isSupportBannerHidden } from "../lib/supportBanner.js";

// Where the "buy me a coffee" button points. Swap this for your own link.
const COFFEE_URL = "https://www.buymeacoffee.com/xexiodev";

export function SupportBanner() {
  const { t } = useLingui();
  const [hidden, setHidden] = useState(isSupportBannerHidden);
  if (hidden) return null;

  function dismiss() {
    dismissSupportBanner();
    setHidden(true);
  }

  return (
    <div className="support-banner" role="complementary">
      <Coffee className="support-banner-icon" size={16} aria-hidden="true" />
      <p>
        <Trans>
          Enjoying Point Taken? If you find it useful, please consider{" "}
          <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
            buying me a coffee
          </a>
          .
        </Trans>
      </p>
      <button aria-label={t`Dismiss for a week`} onClick={dismiss} type="button">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
