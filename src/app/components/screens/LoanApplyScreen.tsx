import { ArrowLeft, LocateFixed, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "../../context/AppContext";
import { localQuote } from "../../lib/pricing";
import { getLoanCalculatorSelection, setLoanCalculatorSelection, setLoanDraft } from "../../lib/selection";
import { BUSINESS_LOAN_PURPOSES, formatBusinessLoanPurpose, parseBusinessLoanPurpose, type BusinessLoanPurposeOption } from "../../lib/business-loan-purpose";
import { getSavedLoanApplicationDraft, saveLoanApplicationDraft } from "../../lib/loan-application-autosave";
import { getLoanTermOptions } from "../../lib/loan-terms";
import type { BusinessDetails, BusinessProfile } from "../../api/types";

interface Props { onNavigate: (screen: string) => void; }
function formatUGX(n: number) { return "UGX " + Math.round(n).toLocaleString("en-UG"); }

const MIN_AMOUNT = 50_000;
const PRODUCT_MAX_AMOUNT = 2_000_000;
const METHODS = [
  { id: "MTN MoMo", label: "MTN MoMo", icon: "📱" },
  { id: "Airtel Money", label: "Airtel Money", icon: "📱" },
];
const EMPTY_BUSINESS: BusinessDetails = {
  businessName: "", applicantPosition: "", locationSource: "none", locationCapturedAt: null, locationAccuracyMeters: null, sector: "", tradingAs: "informal", registrationNumber: "",
  tradingMonths: 0, district: "", physicalAddress: "", latitude: null, longitude: null, goodsOrServices: "",
  customerType: "", staffCount: 0, loanUse: "", repaymentPlan: "",
};
function durationBand(months: number): string {
  if (months < 6) return "Less than 6 months";
  if (months < 12) return "6–12 months";
  if (months < 24) return "1–2 years";
  return "2+ years";
}
const SECTORS = ["Retail / shop", "Wholesale / trading", "Agriculture", "Food and hospitality",
  "Transport and logistics", "Manufacturing", "Beauty and personal care", "Professional services", "Other"];

export function LoanApplyScreen({ onNavigate }: Props) {
  const { t } = useTranslation();
  const { state } = useAppContext();
  const TERMS = getLoanTermOptions();
  const [calculatorSelection] = useState(getLoanCalculatorSelection);
  const [savedDraft] = useState(() => state.user ? getSavedLoanApplicationDraft(state.user.id) : null);
  const calculatorPurpose = calculatorSelection ? parseBusinessLoanPurpose(calculatorSelection.purpose) : null;
  const [amount, setAmount] = useState(savedDraft?.amount ?? calculatorSelection?.amount ?? MIN_AMOUNT);
  const validSavedTerm = savedDraft && TERMS.includes(savedDraft.termDays) ? savedDraft.termDays : undefined;
  const validCalculatorTerm = calculatorSelection && TERMS.includes(calculatorSelection.termDays) ? calculatorSelection.termDays : undefined;
  const [term, setTerm] = useState(validSavedTerm ?? validCalculatorTerm ?? TERMS[0]);
  const [purpose, setPurpose] = useState<BusinessLoanPurposeOption>(savedDraft?.purpose ?? calculatorPurpose?.option ?? "Working capital");
  const [otherPurpose, setOtherPurpose] = useState(savedDraft?.otherPurpose ?? calculatorPurpose?.otherDetails ?? "");
  const [method, setMethod] = useState(savedDraft?.method ?? "MTN MoMo");
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails>({ ...EMPTY_BUSINESS, ...savedDraft?.businessDetails });
  const [income, setIncome] = useState(savedDraft?.income ?? 0);
  const [expenses, setExpenses] = useState(savedDraft?.expenses ?? 0);
  const [existingDebt, setExistingDebt] = useState(savedDraft?.existingDebt ?? 0);
  const [saveError, setSaveError] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [locationError, setLocationError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setLoanCalculatorSelection(null); }, []);

  useEffect(() => {
    if (!state.user) return;
    try {
      saveLoanApplicationDraft(state.user.id, {
        amount,
        termDays: term,
        purpose,
        otherPurpose,
        method,
        employmentStatus: "Business owner",
        occupationOrBusiness: businessDetails.goodsOrServices,
        employerOrBusinessName: businessDetails.businessName,
        workDuration: durationBand(businessDetails.tradingMonths),
        incomeSource: "Business sales",
        repaymentSource: businessDetails.repaymentPlan,
        businessDetails,
        income,
        expenses,
        existingDebt,
      });
      setSaveError("");
    } catch (saveFailure) {
      console.error("Could not save the loan application draft.", saveFailure);
      setSaveError("Kuula could not save this draft in your browser. Keep this page open so you do not lose your changes.");
    }
  }, [state.user, amount, term, purpose, otherPurpose, method, businessDetails, income, expenses, existingDebt]);

  const availableCredit = Math.max(0, state.loan?.availableCredit ?? 0);
  const maxEligibleAmount = Math.min(PRODUCT_MAX_AMOUNT, availableCredit);
  const canApply = maxEligibleAmount >= MIN_AMOUNT;
  const rangeMax = Math.max(MIN_AMOUNT, maxEligibleAmount);

  useEffect(() => {
    if (!canApply) return;
    setAmount((current) => Math.min(Math.max(current, MIN_AMOUNT), maxEligibleAmount));
  }, [canApply, maxEligibleAmount]);

  const quote = localQuote(amount, term);
  const businessCoordinatesAvailable = Number.isFinite(businessDetails.latitude) && Number.isFinite(businessDetails.longitude);
  const businessMapUrl = businessCoordinatesAvailable
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${businessDetails.longitude! - 0.003}%2C${businessDetails.latitude! - 0.003}%2C${businessDetails.longitude! + 0.003}%2C${businessDetails.latitude! + 0.003}&layer=mapnik&marker=${businessDetails.latitude}%2C${businessDetails.longitude}`
    : "";

  const captureBusinessLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location is not supported by this browser. You can still enter the business address above.");
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusinessDetails((current) => ({ ...current, latitude: coords.latitude, longitude: coords.longitude, locationSource: "gps", locationCapturedAt: new Date().toISOString(), locationAccuracyMeters: Math.round(coords.accuracy) }));
        setLocationLoading(false);
      },
      (geoError) => {
        const message = geoError.code === geoError.PERMISSION_DENIED
          ? "Location permission was denied. Allow location access in your browser settings and try again."
          : geoError.code === geoError.POSITION_UNAVAILABLE
            ? "Your device could not determine its location. Check that location services are enabled and try again."
            : "Getting your location timed out. Move to an area with a clearer GPS signal and try again.";
        setLocationError(message);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  const setManualPin = () => {
    setLocationError("");
    const latitude = Number(manualLatitude);
    const longitude = Number(manualLongitude);
    if (!manualLatitude.trim() || !manualLongitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setLocationError("Enter valid latitude (-90 to 90) and longitude (-180 to 180) to place the pin.");
      return;
    }
    setBusinessDetails(current => ({ ...current, latitude, longitude, locationSource: "manual", locationCapturedAt: new Date().toISOString(), locationAccuracyMeters: null }));
  };

  const adjustPin = (latitudeOffset: number, longitudeOffset: number) => {
    if (businessDetails.latitude == null || businessDetails.longitude == null) return;
    setBusinessDetails(current => ({
      ...current,
      latitude: Math.max(-90, Math.min(90, current.latitude! + latitudeOffset)),
      longitude: Math.max(-180, Math.min(180, current.longitude! + longitudeOffset)),
      locationSource: "manual", locationAccuracyMeters: null, locationCapturedAt: new Date().toISOString(),
    }));
  };

  const continueToReview = () => {
    setError("");
    if (!canApply) { setError("No Growth Line is currently available. Complete the required Credit Pass steps and try again when Kuula shows available credit."); return; }
    if (amount < MIN_AMOUNT || amount > maxEligibleAmount) { setError("Choose an amount within your current Growth Line."); return; }
    if (purpose === "Other" && !otherPurpose.trim()) { setError("Describe the other business use for this loan."); return; }
    for (const key of ["businessName", "sector", "district", "physicalAddress", "goodsOrServices", "customerType", "loanUse", "repaymentPlan"] as const) {
      if (!businessDetails[key].trim()) { setError("Complete all business information, including " + key + "."); return; }
    }
    if (!businessDetails.applicantPosition.trim()) { setError("Select your role or position in the business."); return; }
    if (businessDetails.tradingAs === "registered" && !businessDetails.registrationNumber.trim()) {
      setError("Registered businesses must provide their business registration number."); return;
    }
    if (!Number.isSafeInteger(businessDetails.tradingMonths) || businessDetails.tradingMonths < 1) { setError("Enter the number of months this business has traded."); return; }
    if (!Number.isSafeInteger(businessDetails.staffCount) || businessDetails.staffCount < 0) { setError("Enter a valid number of workers."); return; }
    if (!Number.isFinite(income) || income <= 0) { setError("Enter your average monthly income."); return; }
    if (!Number.isFinite(expenses) || expenses < 0) { setError("Monthly expenses cannot be negative."); return; }
    if (!Number.isFinite(existingDebt) || existingDebt < 0) { setError("Existing monthly debt payments cannot be negative."); return; }
    if (expenses + existingDebt >= income) { setError("Your expenses and existing debt leave no disposable monthly income for new credit."); return; }

    const business: BusinessProfile = {
      ...businessDetails,
      monthlySales: Math.round(income),
      monthlyBusinessExpenses: Math.round(expenses),
      monthlyExistingDebt: Math.round(existingDebt),
    };
    setLoanDraft({
      business,
      amount,
      termDays: term,
      purpose: formatBusinessLoanPurpose(purpose, otherPurpose),
      channel: method,
      employmentStatus: "Business owner",
      occupationOrBusiness: business.goodsOrServices,
      employerOrBusinessName: business.businessName,
      workDuration: durationBand(business.tradingMonths),
      incomeSource: "Business sales",
      repaymentSource: business.repaymentPlan,
      declaredMonthlyIncome: Math.round(income),
      declaredMonthlyExpenses: Math.round(expenses),
      existingDebtPayment: Math.round(existingDebt),
    });
    onNavigate("loan-review");
  };

  const businessTextField = (label: string, key: keyof BusinessDetails, placeholder: string) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>{label}</span>
      <input value={String(businessDetails[key])} maxLength={key === "goodsOrServices" || key === "loanUse" || key === "repaymentPlan" ? 300 : 120} placeholder={placeholder}
        onChange={(e) => setBusinessDetails((v) => ({ ...v, [key]: e.target.value }))}
        className="kx-input" style={{ width: "100%" }} />
    </label>
  );
  const businessNumberField = (label: string, key: "tradingMonths" | "staffCount", min: number) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>{label}</span>
      <input type="number" min={min} step={1} value={businessDetails[key]}
        onChange={(e) => setBusinessDetails((v) => ({ ...v, [key]: Number(e.target.value) }))}
        className="kx-input" style={{ width: "100%" }} />
    </label>
  );
  const moneyInput = (label: string, value: number, setter: (value: number) => void, hint: string) => (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", border: "1px solid #D8E2DC", borderRadius: 12, background: "white", padding: "0 12px" }}>
        <span style={{ fontSize: 12, color: "#68766F", fontWeight: 700 }}>UGX</span>
        <input type="number" min={0} step={50000} value={value} onChange={(e) => setter(Number(e.target.value))} style={{ flex: 1, height: 46, border: 0, outline: 0, paddingLeft: 10, fontWeight: 700, color: "#13251C" }} />
      </div>
      <span style={{ display: "block", fontSize: 10.5, color: "#89948E", marginTop: 4 }}>{hint}</span>
    </label>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: "#F7FAF8", paddingTop: 0 }}>
      <div className="flex items-center px-4 pt-4 pb-4" style={{ background: "linear-gradient(135deg, #0B5E3A, #087148)" }}>
        <button onClick={() => onNavigate("home")} aria-label="Go back" style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.18)", border: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={18} color="white" /></button>
        <span style={{ fontSize: 17, fontWeight: 700, color: "white", marginLeft: 12 }}>Kuula Business application</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ paddingBottom: 120 }}>
        <p role={saveError ? "alert" : "status"} style={{ margin: 0, fontSize: 11, color: saveError ? "#A13A3A" : "#68766F" }}>
          {saveError || (savedDraft ? "Saved progress restored. Your changes save automatically in this browser tab and remain if you go back." : "Your progress saves automatically in this browser tab and remains if you go back or refresh. It clears after sign out or successful submission.")}
        </p>
        {!canApply && <div className="p-4 rounded-2xl" style={{ background: "#FFF9E5", border: "1px solid #F2D77B" }}><p style={{ fontSize: 13, fontWeight: 800, color: "#6B5414", margin: "0 0 4px" }}>No Growth Line available yet</p><p style={{ fontSize: 11.5, color: "#776628", margin: 0, lineHeight: 1.5 }}>Kuula will not accept a new application until your Credit Pass shows at least {formatUGX(MIN_AMOUNT)} available. Check identity verification, credit evidence and any existing facility.</p></div>}

        <div className="p-5 rounded-2xl" style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", opacity: canApply ? 1 : 0.6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.loanAmount").toUpperCase()}</label>
          <div className="flex items-baseline gap-2 mt-2"><span style={{ fontSize: 15, fontWeight: 700, color: "#5D6C64" }}>UGX</span><input disabled={!canApply} type="number" value={amount} onChange={(e) => { const v = Number(e.target.value); if (canApply && v >= MIN_AMOUNT && v <= maxEligibleAmount) setAmount(v); }} style={{ fontSize: 34, fontWeight: 800, color: "#0B5E3A", border: "none", outline: "none", background: "transparent", width: "100%" }} /></div>
          <input disabled={!canApply} type="range" min={MIN_AMOUNT} max={rangeMax} step={50000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: "100%", accentColor: "#0B5E3A", marginTop: 12 }} />
          <div className="flex justify-between"><span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatUGX(MIN_AMOUNT)}</span><span style={{ fontSize: 11, color: "#9CA3AF" }}>{canApply ? formatUGX(maxEligibleAmount) : "Not available"}</span></div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}><label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.repaymentTerm").toUpperCase()}</label><div className="flex gap-2 flex-wrap mt-3">{TERMS.map((d) => <button key={d} onClick={() => setTerm(d)} style={{ padding: "8px 14px", borderRadius: 10, border: term === d ? "none" : "1.5px solid #DDE5E0", background: term === d ? "#0B5E3A" : "white", color: term === d ? "white" : "#374151", fontSize: 13, fontWeight: 600 }}>{d} {t("loanApply.days")}</button>)}</div></div>
        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>BUSINESS LOAN PURPOSE</label>
          <p style={{ fontSize: 11, color: "#68766F", margin: "5px 0 0" }}>Choose how your business plans to use this credit.</p>
          <div className="flex gap-2 flex-wrap mt-3">
            {BUSINESS_LOAN_PURPOSES.map((option) => <button key={option} type="button" onClick={() => setPurpose(option)} style={{ padding: "7px 12px", borderRadius: 20, border: purpose === option ? "1px solid #0B5E3A" : "1.5px solid #E5E7EB", background: purpose === option ? "#EDF8F2" : "white", color: purpose === option ? "#0B5E3A" : "#6B7280", fontSize: 12, fontWeight: 600 }}>{option}</button>)}
          </div>
          {purpose === "Other" && <label style={{ display: "block", marginTop: 14 }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>Describe your business use</span>
            <textarea value={otherPurpose} maxLength={100} onChange={(event) => setOtherPurpose(event.target.value)} placeholder="Tell us what your business will use the loan for" rows={3} style={{ width: "100%", border: "1px solid #D8E2DC", borderRadius: 12, padding: 12, background: "white", color: "#13251C", resize: "vertical" }} />
          </label>}
        </div>

        <section className="p-4 rounded-2xl" style={{ background: "white" }} aria-label="Business profile">
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#13251C", margin: "0 0 5px" }}>Tell us about your business</h2>
          <p style={{ fontSize: 11, color: "#68766F", margin: "0 0 14px", lineHeight: 1.5 }}>We lend only for businesses. A Kuula officer will verify these declarations before approval. Both formally registered and informal businesses can be assessed.</p>
          <div style={{ display: "grid", gap: 14 }}>
            {businessTextField("Business or trading name", "businessName", "e.g. Amina's Grocery")}
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>Your position in this business</span>
              <select value={businessDetails.applicantPosition} className="kx-input" style={{ width: "100%" }}
                onChange={event => setBusinessDetails(current => ({ ...current, applicantPosition: event.target.value }))}>
                <option value="">Choose your position</option>
                {["Owner", "Co-owner", "Director", "Manager", "Operator", "Other authorized representative"].map(position =>
                  <option value={position} key={position}>{position}</option>)}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>Business sector</span>
              <select value={businessDetails.sector} onChange={(e) => setBusinessDetails((v) => ({ ...v, sector: e.target.value }))} className="kx-input" style={{ width: "100%" }}>
                <option value="">Select your sector</option>
                {SECTORS.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#425149", marginBottom: 6 }}>Registration status</span>
              <select value={businessDetails.tradingAs} onChange={(e) => setBusinessDetails((v) => ({ ...v, tradingAs: e.target.value as BusinessDetails["tradingAs"] }))} className="kx-input" style={{ width: "100%" }}>
                <option value="informal">Informal / not formally registered</option>
                <option value="registered">Registered business</option>
              </select>
            </label>
            {businessDetails.tradingAs === "registered" && businessTextField("Business registration number", "registrationNumber", "Registration / URSB number")}
            {businessNumberField("Months this business has operated", "tradingMonths", 1)}
            {businessTextField("District", "district", "e.g. Wakiso")}
            {businessTextField("Business location / address", "physicalAddress", "Trading centre, street, shop or market")}
            <div style={{ border: "1px solid #DCE7E1", borderRadius: 14, padding: 12, background: "#FBFDFC" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ width: 36, height: 36, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 11, color: "#0B5E3A", background: "#EAF5EF" }}><MapPin size={19} /></span>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", fontSize: 13, color: "#183025" }}>Pin your exact business location</strong>
                  <span style={{ display: "block", marginTop: 4, color: "#68766F", fontSize: 11, lineHeight: 1.5 }}>Use your device GPS to add a precise map pin. Your location is included with this loan application for business verification.</span>
                </div>
              </div>
              <button type="button" onClick={captureBusinessLocation} disabled={locationLoading} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 42, marginTop: 12, padding: "0 13px", border: "1px solid #B7DEC9", borderRadius: 11, background: "white", color: "#0B5E3A", fontSize: 12, fontWeight: 700, opacity: locationLoading ? 0.65 : 1 }}>
                <LocateFixed size={16} />{locationLoading ? "Finding your location…" : businessCoordinatesAvailable ? "Update my location" : "Use my current location"}
              </button>
              <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: "#F2F8F4" }}>
                <strong style={{ fontSize: 12, color: "#173D29" }}>Or place the pin using coordinates</strong>
                <p style={{ margin: "5px 0", color: "#61736A", fontSize: 11 }}>If you are away from the premises, obtain the correct latitude and longitude from your map app. Do not use your home location for a separate business.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ flex: "1 1 110px", fontSize: 11 }}>Latitude
                    <input aria-label="Business latitude" inputMode="decimal" type="number" step="any" min={-90} max={90} className="kx-input" style={{ width: "100%" }} value={manualLatitude} onChange={event => setManualLatitude(event.target.value)} placeholder="0.347596" />
                  </label>
                  <label style={{ flex: "1 1 110px", fontSize: 11 }}>Longitude
                    <input aria-label="Business longitude" inputMode="decimal" type="number" step="any" min={-180} max={180} className="kx-input" style={{ width: "100%" }} value={manualLongitude} onChange={event => setManualLongitude(event.target.value)} placeholder="32.582520" />
                  </label>
                </div>
                <button type="button" onClick={setManualPin} style={{ marginTop: 8, padding: "9px 13px", border: "1px solid #9CC9B0", background: "white", borderRadius: 9, color: "#0B5E3A", fontSize: 12, fontWeight: 700 }}>Place manual pin</button>
              </div>
              {locationError && <p role="alert" style={{ margin: "9px 0 0", color: "#A13A3A", fontSize: 11, lineHeight: 1.5 }}>{locationError}</p>}
              {businessCoordinatesAvailable && <>
                <p style={{ margin: "10px 0 8px", color: "#53635A", fontSize: 11 }}>Pinned coordinates: {businessDetails.latitude!.toFixed(6)}, {businessDetails.longitude!.toFixed(6)} · {businessDetails.locationSource === "gps" ? `GPS accuracy ~${businessDetails.locationAccuracyMeters ?? "unknown"} m` : "Manually positioned"}</p>
                <div style={{ width: "100%", height: 220, overflow: "hidden", border: "1px solid #DCE7E1", borderRadius: 12, background: "#EAF0EC" }}>
                  <iframe title="Map preview of pinned business location" src={businessMapUrl} loading="lazy" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", border: 0 }} />
                </div>
                <div style={{ marginTop: 9, display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => adjustPin(0.0001, 0)} aria-label="Move business pin north" className="kx-input">↑ North</button>
                  <button type="button" onClick={() => adjustPin(-0.0001, 0)} aria-label="Move business pin south" className="kx-input">↓ South</button>
                  <button type="button" onClick={() => adjustPin(0, -0.0001)} aria-label="Move business pin west" className="kx-input">← West</button>
                  <button type="button" onClick={() => adjustPin(0, 0.0001)} aria-label="Move business pin east" className="kx-input">→ East</button>
                </div>
                <a href={`https://www.openstreetmap.org/?mlat=${businessDetails.latitude}&mlon=${businessDetails.longitude}#map=17/${businessDetails.latitude}/${businessDetails.longitude}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, color: "#0B5E3A", fontSize: 11, fontWeight: 700 }}>Open pin in map</a>
              </>}
              <span style={{ display: "block", marginTop: 9, color: "#89948E", fontSize: 10, lineHeight: 1.45 }}>Map preview loads from OpenStreetMap only after you share your location. A business address is required; GPS capture is optional at this stage. Confirm the pin matches your real business premises.</span>
            </div>
            {businessTextField("Main products or services", "goodsOrServices", "What does the business sell or provide?")}
            {businessTextField("Who are your customers?", "customerType", "e.g. walk-in shoppers, farmers, contractors")}
            {businessNumberField("Number of workers, including yourself", "staffCount", 0)}
            {businessTextField("How exactly will you use this loan?", "loanUse", "e.g. purchase 15 cartons of inventory")}
            {businessTextField("How will your business repay the loan?", "repaymentPlan", "e.g. daily sales revenue")}
          </div>
        </section>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#13251C", margin: "0 0 4px" }}>Affordability information</p>
          <p style={{ fontSize: 11, color: "#68766F", margin: "0 0 14px", lineHeight: 1.5 }}>Enter your actual current figures. Kuula uses them together with verified credit evidence, and the server recalculates eligibility before approval and again before disbursement.</p>
          <div style={{ display: "grid", gap: 14 }}>
            {moneyInput("Average monthly business sales", income, setIncome, "Total monthly sales / business revenue, not your salary.")}
            {moneyInput("Monthly business expenses", expenses, setExpenses, "Operating costs, stock purchases and business expenses; exclude existing loan instalments.")}
            {moneyInput("Existing monthly debt repayments", existingDebt, setExistingDebt, "Use zero only if you have no existing monthly debt repayments.")}
          </div>
        </div>

        <div className="p-4 rounded-2xl" style={{ background: "white" }}><label style={{ fontSize: 12, fontWeight: 700, color: "#5D6C64" }}>{t("loanApply.disbursementMethod").toUpperCase()}</label><p style={{ fontSize: 11, color: "#68766F", margin: "5px 0 0" }}>Approved business credit is sent to your verified mobile-money account. Kuula may request business or supplier details during review.</p><div className="flex flex-col gap-2 mt-3">{METHODS.map((m) => <button key={m.id} onClick={() => setMethod(m.id)} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: method === m.id ? "#EDF8F2" : "#F9FAFB", border: method === m.id ? "1.5px solid #B7DEC9" : "1.5px solid transparent", textAlign: "left" }}><span style={{ fontSize: 20 }}>{m.icon}</span><span style={{ fontSize: 14, fontWeight: 600, color: "#1F2937", flex: 1 }}>{m.label}</span><span style={{ width: 20, height: 20, borderRadius: 10, border: method === m.id ? "6px solid #0B5E3A" : "2px solid #D1D5DB" }} /></button>)}</div></div>

        <div className="p-4 rounded-2xl" style={{ background: "#FFF9E5", border: "1px solid #F2D77B" }}><div className="flex justify-between py-1.5"><span>Principal</span><strong>{formatUGX(amount)}</strong></div><div className="flex justify-between py-1.5"><span>Interest ({quote.aprPercent}% APR, simple)</span><strong>{formatUGX(quote.interest)}</strong></div><div className="flex justify-between py-2" style={{ borderTop: "1px solid #EAD277", marginTop: 5 }}><strong>Total repayment</strong><strong style={{ color: "#0B5E3A" }}>{formatUGX(quote.total)}</strong></div></div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3" style={{ background: "white", borderTop: "1px solid #E8EEEA" }}>{error && <p style={{ fontSize: 11.5, color: "#B91C1C", textAlign: "center", marginBottom: 8 }}>{error}</p>}<button disabled={!canApply} onClick={continueToReview} className="kuula-primary" style={{ width: "100%", height: 52, opacity: canApply ? 1 : 0.55, cursor: canApply ? "pointer" : "not-allowed" }}>Review Application</button></div>
    </div>
  );
}
