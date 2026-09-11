import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Zap, PiggyBank, TrendingUp, ChevronRight } from "lucide-react";
import kuulaLogo from "/kuula-logo-light.png";
import { ImageWithFallback } from "../figma/ImageWithFallback";

interface Props {
  onNavigate: (screen: string) => void;
}

const ONBOARDED_KEY = "kuula_onboarded";

export function OnboardingScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const slides = [
    {
      icon: Zap,
      title: t("onboarding.slide1Title"),
      body: t("onboarding.slide1Body"),
    },
    {
      icon: PiggyBank,
      title: t("onboarding.slide2Title"),
      body: t("onboarding.slide2Body"),
    },
    {
      icon: TrendingUp,
      title: t("onboarding.slide3Title"),
      body: t("onboarding.slide3Body"),
    },
  ];

  const isLast = index === slides.length - 1;

  const finish = () => {
    try { localStorage.setItem(ONBOARDED_KEY, "1"); } catch { /* ignore */ }
    onNavigate("welcome");
  };

  const next = () => {
    if (isLast) finish();
    else setIndex((i) => Math.min(i + 1, slides.length - 1));
  };

  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta < -40) next();
    else if (delta > 40) prev();
    touchStartX.current = null;
  };

  const Icon = slides[index].icon;

  return (
    <div className="flex flex-col h-full bg-white" style={{ paddingTop: 0 }}>
      {/* Top bar: brand + skip */}
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center">
          <ImageWithFallback src={kuulaLogo} alt="Kuula" style={{ height: 26, width: "auto", objectFit: "contain" }} />
        </div>
        <button
          onClick={finish}
          style={{ background: "none", border: "none", fontSize: 14, fontWeight: 600, color: "#6B7280", cursor: "pointer", padding: "6px 4px" }}
        >
          {t("onboarding.skip")}
        </button>
      </div>

      {/* Swipeable slide area */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-8"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ textAlign: "center" }}
      >
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: 36,
            background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 16px 36px rgba(11,107,58,0.28)",
            marginBottom: 40,
            position: "relative",
          }}
        >
          <Icon size={56} color="#12B984" strokeWidth={2.2} />
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "#1F2937", letterSpacing: -0.5, marginBottom: 12 }}>
          {slides[index].title}
        </h2>
        <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.6, maxWidth: 280 }}>
          {slides[index].body}
        </p>
      </div>

      {/* Pagination dots */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Slide ${i + 1}`}
            style={{
              width: i === index ? 22 : 8,
              height: 8,
              borderRadius: 4,
              border: "none",
              padding: 0,
              cursor: "pointer",
              background: i === index ? "var(--brand-primary)" : "#D1D5DB",
              transition: "width 0.25s, background 0.25s",
            }}
          />
        ))}
      </div>

      {/* CTAs */}
      <div className="px-6 pb-10 flex flex-col gap-3">
        <button
          onClick={next}
          className="w-full flex items-center justify-center gap-2"
          style={{
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))",
            color: "white",
            fontSize: 16,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 6px 20px rgba(11,107,58,0.3)",
          }}
        >
          {isLast ? t("onboarding.getStarted") : t("onboarding.next")}
          <ChevronRight size={18} />
        </button>

        <div style={{ textAlign: "center", fontSize: 13, color: "#6B7280" }}>
          {t("onboarding.haveAccount")}{" "}
          <button
            onClick={finish}
            style={{ background: "none", border: "none", color: "var(--brand-primary)", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            {t("onboarding.logIn")}
          </button>
        </div>
      </div>
    </div>
  );
}
