import { Globe, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { KuulaLogo } from "../brand/KuulaLogo";
import { AuthStory } from "../auth/AuthLayout";
import { APP_LANGUAGES } from "../../../i18n";

interface Props { onNavigate: (screen: string) => void; }

/** First screen for signed-out visitors: brand story over the photos, then sign up or log in. */
export function LandingScreen({ onNavigate }: Props) {
  const { i18n } = useTranslation();
  const language = APP_LANGUAGES.find((l) => l.code === i18n.language)?.native ?? "English";

  return (
    <div className="kx kx-landing kx-on-photo">
      <div className="kx-landing__top">
        <KuulaLogo tone="light" size={36} subtitle={null} />
        <button type="button" className="kx-chip" onClick={() => onNavigate("language")} aria-label={`Language: ${language}. Change language`}>
          <Globe size={15} /> {language}
        </button>
      </div>

      <div className="kx-landing__body">
        <AuthStory />
        <div className="kx-landing__actions">
          <button type="button" className="kx-btn kx-btn--primary kx-btn--lg" onClick={() => onNavigate("create-account")}>
            Create account <ArrowRight size={18} />
          </button>
          <button type="button" className="kx-btn kx-btn--secondary kx-btn--lg" onClick={() => onNavigate("login")}>
            Log in
          </button>
        </div>
      </div>

      <div className="kx-landing__staff">
        <span>© {new Date().getFullYear()} Kuula Microfinance Limited</span>
        <button type="button" className="kx-link" onClick={() => onNavigate("admin-login")}>Staff sign in</button>
      </div>
    </div>
  );
}
