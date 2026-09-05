import { useLingui } from "@lingui/react/macro";
import { Globe } from "lucide-react";
import { LOCALES, switchLocale } from "../lib/i18n.js";

export function LanguageSwitcher({ iconOnly = false }) {
  const { t, i18n } = useLingui();
  return (
    <label className={`language-switcher${iconOnly ? " icon-only" : ""}`} title={t`Language`}>
      <Globe className="language-switcher-globe" aria-hidden="true" />
      <select
        aria-label={t`Language`}
        onChange={(event) => switchLocale(event.target.value)}
        value={i18n.locale}
      >
        {LOCALES.map((locale) => (
          <option key={locale.code} value={locale.code}>
            {locale.label}
          </option>
        ))}
      </select>
    </label>
  );
}
