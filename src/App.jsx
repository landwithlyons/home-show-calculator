import { useEffect, useMemo, useState } from "react";

function clampNumber(n, min = 0) {
  const x = Number.isFinite(n) ? n : 0;
  return Math.max(min, x);
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function formatMoney(n) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// Standard amortization: M = P * r * (1+r)^n / ((1+r)^n - 1)
function monthlyPI(loanAmount, annualRatePct, termYears) {
  const P = clampNumber(loanAmount, 0);
  const r = clampNumber(annualRatePct, 0) / 100 / 12;
  const n = clampNumber(termYears, 1) * 12;

  if (P === 0) return 0;
  if (r === 0) return P / n;

  const pow = Math.pow(1 + r, n);
  return (P * r * pow) / (pow - 1);
}

function buildCopySummary(calc, inputs) {
  const lines = [
    "Home Payment Estimator (Illustrative Only)",
    "----------------------------------------",
    `Purchase Price: ${formatMoney(calc.price)}`,
    `Down Payment: ${formatMoney(calc.downDollar)} (${round2(calc.downPct)}%)`,
    `Loan Amount: ${formatMoney(calc.loan)}`,
    "",
    "Monthly Breakdown:",
    `P&I: ${formatMoney(calc.pi)}`,
    `Taxes: ${formatMoney(calc.taxesM)}`,
    `HOI: ${formatMoney(calc.hoiM)}`,
    `PMI (est.): ${formatMoney(calc.pmiM)}`,
    `HOA: ${formatMoney(calc.hoaM)}`,
    `PITI: ${formatMoney(calc.piti)}`,
    `Total (PITI + HOA): ${formatMoney(calc.total)}`,
    "",
    `Income needed (housing-only @ 42% max): ${formatMoney(calc.requiredIncomeM)} / mo (~${formatMoney(
      calc.requiredIncomeA
    )} / yr)`,
    "",
    `Assumptions: Taxes=${formatMoney(inputs.taxesAnnual)}/yr, HOI=${formatMoney(inputs.hoiAnnual)}/yr, PMI placeholder=0.50%/yr if <20% down`,
    "",
    "DISCLAIMER: This is for illustrative purposes only and is NOT a Loan Estimate or a rate lock. Actual payment, PMI, and eligibility vary by loan program, credit, property, taxes/insurance, and underwriting. Talk to a mortgage professional and request an official Loan Estimate before choosing a loan.",
  ];
  return lines.join("\n");
}

export default function App() {
  // Inputs
  const [purchasePrice, setPurchasePrice] = useState(350000);
  const [downType, setDownType] = useState("%");
  const [downValue, setDownValue] = useState(5); // % or $

  const [rate, setRate] = useState(6.75);
  const [termYears, setTermYears] = useState(30);
  const [hoaMonthly, setHoaMonthly] = useState(0);

  // Taxes/HOI (auto-suggested unless user edits)
  const [taxesAnnual, setTaxesAnnual] = useState(0);
  const [hoiAnnual, setHoiAnnual] = useState(0);
  const [taxesTouched, setTaxesTouched] = useState(false);
  const [hoiTouched, setHoiTouched] = useState(false);

  // Lead
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(true);

  const [status, setStatus] = useState({ type: "idle", msg: "" });
  const [copyStatus, setCopyStatus] = useState("");

  const suggestedTaxes = useMemo(() => purchasePrice * 0.01, [purchasePrice]);
  const suggestedHoi = useMemo(() => purchasePrice * 0.008, [purchasePrice]);

  useEffect(() => {
    // Only auto-apply if user hasn't edited the fields.
    if (!taxesTouched) setTaxesAnnual(suggestedTaxes);
    if (!hoiTouched) setHoiAnnual(suggestedHoi);
  }, [suggestedTaxes, suggestedHoi, taxesTouched, hoiTouched]);

  const calc = useMemo(() => {
    const price = clampNumber(purchasePrice, 0);

    const downDollar =
      downType === "%"
        ? (price * clampNumber(downValue, 0)) / 100
        : clampNumber(downValue, 0);

    const downDollarCapped = Math.min(downDollar, price);
    const loan = price - downDollarCapped;

    const downPct = price > 0 ? (downDollarCapped / price) * 100 : 0;

    const pi = monthlyPI(loan, rate, termYears);
    const taxesM = clampNumber(taxesAnnual, 0) / 12;
    const hoiM = clampNumber(hoiAnnual, 0) / 12;
    const hoaM = clampNumber(hoaMonthly, 0);

    // PMI placeholder: 0.50% annually on loan amount if <20% down
    const pmiM = downPct < 20 ? (loan * 0.005) / 12 : 0;

    const piti = pi + taxesM + hoiM + pmiM;
    const total = piti + hoaM;

    const dtiTarget = 0.42;
    const requiredIncomeM = piti / dtiTarget;
    const requiredIncomeA = requiredIncomeM * 12;

    // Avoid PMI helper:
    const down20Dollar = price * 0.2;
    const extraTo20 = Math.max(0, down20Dollar - downDollarCapped);

    return {
      price,
      downDollar: downDollarCapped,
      downPct,
      loan,
      pi,
      taxesM,
      hoiM,
      hoaM,
      pmiM,
      piti,
      total,
      dtiTarget,
      requiredIncomeM,
      requiredIncomeA,
      down20Dollar,
      extraTo20,
    };
  }, [
    purchasePrice,
    downType,
    downValue,
    rate,
    termYears,
    taxesAnnual,
    hoiAnnual,
    hoaMonthly,
  ]);

  async function copySummary() {
    try {
      const text = buildCopySummary(calc, { taxesAnnual, hoiAnnual });
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied to clipboard.");
      setTimeout(() => setCopyStatus(""), 2000);
    } catch {
      setCopyStatus("Copy failed (browser blocked clipboard).");
      setTimeout(() => setCopyStatus(""), 2500);
    }
  }

  function resetSuggested() {
    setTaxesTouched(false);
    setHoiTouched(false);
    setTaxesAnnual(suggestedTaxes);
    setHoiAnnual(suggestedHoi);
  }

  async function submitLead() {
    setStatus({ type: "idle", msg: "" });

    if (!firstName.trim() || !phone.trim() || !email.trim()) {
      setStatus({ type: "error", msg: "Please enter first name, phone, and email." });
      return;
    }
    if (!consent) {
      setStatus({ type: "error", msg: "Please check consent to submit." });
      return;
    }

    const payload = {
      event_source: "Home Show",
      first_name: firstName.trim(),
      phone: phone.trim(),
      email: email.trim(),

      purchase_price: round2(calc.price),
      down_payment_type: downType,
      down_payment_value: round2(Number(downValue)),
      down_payment_percent: round2(calc.downPct),

      rate: round2(Number(rate)),
      term_years: Number(termYears),

      taxes_annual: round2(Number(taxesAnnual)),
      hoi_annual: round2(Number(hoiAnnual)),
      hoa_monthly: round2(Number(hoaMonthly)),

      loan_amount: round2(calc.loan),
      pi_monthly: round2(calc.pi),
      pmi_monthly: round2(calc.pmiM),
      piti_monthly: round2(calc.piti),
      total_monthly: round2(calc.total),

      dti_target: calc.dtiTarget,
      required_income_monthly: round2(calc.requiredIncomeM),
      required_income_annual: round2(calc.requiredIncomeA),
    };

    try {
      setStatus({ type: "loading", msg: "Submitting..." });

      const res = await fetch("/.netlify/functions/submitLead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Submission failed.");

      setStatus({
        type: "success",
        msg: "Submitted! Thanks — a mortgage professional will follow up to tighten this estimate.",
      });
    } catch (e) {
      setStatus({ type: "error", msg: e.message || "Something went wrong." });
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: 20 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Home Payment Estimator</h1>
            <p style={{ marginTop: 6, color: "#444" }}>
              Fast planning estimates for a home show conversation.
            </p>
          </div>
        </header>

        {/* Big disclaimer */}
        <div
          style={{
            marginTop: 10,
            padding: 14,
            borderRadius: 12,
            border: "2px solid #111",
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>
            IMPORTANT DISCLAIMER (Illustrative Purposes Only)
          </div>
          <div style={{ color: "#222", lineHeight: 1.35 }}>
            This tool provides <b>illustrative estimates only</b> and is <b>NOT</b> a Loan Estimate, a rate lock, or a loan
            approval. Actual payment, PMI, and eligibility vary by loan program, credit, property details, taxes/insurance,
            and underwriting. <b>Talk to a mortgage professional</b> and request an <b>official Loan Estimate</b> before choosing a loan.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
          {/* Inputs */}
          <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Inputs</h2>

            <label style={{ display: "block", marginBottom: 10 }}>
              Purchase price
              <input
                type="number"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
                style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "end", marginBottom: 10 }}>
              <label style={{ display: "block" }}>
                Down type
                <select
                  value={downType}
                  onChange={(e) => setDownType(e.target.value)}
                  style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
                >
                  <option value="%">%</option>
                  <option value="$">$</option>
                </select>
              </label>

              <label style={{ display: "block" }}>
                Down payment {downType === "%" ? "(%)" : "($)"}
                <input
                  type="number"
                  min="0"
                  value={downValue}
                  onChange={(e) => setDownValue(Number(e.target.value))}
                  style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
                />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <label style={{ display: "block" }}>
                Interest rate (APR %)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
                />
              </label>
              <label style={{ display: "block" }}>
                Term (years)
                <select
                  value={termYears}
                  onChange={(e) => setTermYears(Number(e.target.value))}
                  style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
                >
                  <option value={30}>30</option>
                  <option value={20}>20</option>
                  <option value={15}>15</option>
                  <option value={10}>10</option>
                </select>
              </label>
            </div>

            <label style={{ display: "block", marginBottom: 10 }}>
              Annual property taxes (suggested: 1% of price)
              <input
                type="number"
                min="0"
                value={taxesAnnual}
                onChange={(e) => {
                  setTaxesTouched(true);
                  setTaxesAnnual(Number(e.target.value));
                }}
                style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
              />
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                Suggested: {formatMoney(suggestedTaxes)} / yr
              </div>
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              Annual homeowners insurance (suggested: 0.8% of price)
              <input
                type="number"
                min="0"
                value={hoiAnnual}
                onChange={(e) => {
                  setHoiTouched(true);
                  setHoiAnnual(Number(e.target.value));
                }}
                style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
              />
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                Suggested: {formatMoney(suggestedHoi)} / yr
              </div>
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              HOA (monthly, optional)
              <input
                type="number"
                min="0"
                value={hoaMonthly}
                onChange={(e) => setHoaMonthly(Number(e.target.value))}
                style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>

            <button
              onClick={resetSuggested}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #333",
                background: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reset taxes & insurance to suggested
            </button>
          </section>

          {/* Results */}
          <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <h2 style={{ marginTop: 0, fontSize: 18 }}>Results</h2>
              <button
                onClick={copySummary}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: "#111",
                  color: "white",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Copy summary
              </button>
            </div>
            {copyStatus && <div style={{ marginTop: 6, color: "#166534", fontWeight: 700 }}>{copyStatus}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <Stat label="Down payment" value={`${formatMoney(calc.downDollar)} (${round2(calc.downPct)}%)`} />
              <Stat label="Loan amount" value={formatMoney(calc.loan)} />
              <Stat label="P&I" value={`${formatMoney(calc.pi)} / mo`} />
              <Stat label="Taxes" value={`${formatMoney(calc.taxesM)} / mo`} />
              <Stat label="HOI" value={`${formatMoney(calc.hoiM)} / mo`} />
              <Stat label="PMI (est.)" value={`${formatMoney(calc.pmiM)} / mo`} />
              <Stat label="PITI" value={`${formatMoney(calc.piti)} / mo`} />
              <Stat label="Total (PITI + HOA)" value={`${formatMoney(calc.total)} / mo`} />
            </div>

            {/* PMI helper */}
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>PMI callout</div>
              <div style={{ color: "#7c2d12", lineHeight: 1.35 }}>
                PMI is shown using a <b>0.50%</b> placeholder (only if under 20% down). Actual PMI can vary a lot.
              </div>
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Stat label="Down payment to reach 20%" value={formatMoney(calc.down20Dollar)} />
                <Stat
                  label="Extra down needed to reach 20%"
                  value={calc.extraTo20 > 0 ? formatMoney(calc.extraTo20) : "Already at/above 20%"}
                />
              </div>
            </div>

            {/* DTI backwards */}
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Income needed (housing-only @ 42% max)</div>
              <div style={{ color: "#1e3a8a" }}>
                To keep <b>housing (PITI)</b> at or below <b>42%</b> of gross monthly income:
              </div>
              <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>
                {formatMoney(calc.requiredIncomeM)} / month gross income needed
              </div>
              <div style={{ marginTop: 4, color: "#1e3a8a" }}>
                (~{formatMoney(calc.requiredIncomeA)} / year)
              </div>
              <div style={{ marginTop: 8, color: "#1e3a8a", fontSize: 13 }}>
                This excludes other monthly debts. If you have other debts, the required income would be higher.
              </div>
            </div>
          </section>
        </div>

        {/* Lead capture */}
        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginTop: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Save my estimate & follow up</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <label style={{ display: "block" }}>
              First name
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "block" }}>
              Phone
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "block" }}>
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: "100%", padding: 10, marginTop: 6, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>
          </div>

          <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span style={{ color: "#444" }}>It’s OK to contact me about this estimate.</span>
          </label>

          <button
            onClick={submitLead}
            disabled={status.type === "loading"}
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {status.type === "loading" ? "Submitting..." : "Submit"}
          </button>

          {status.type !== "idle" && (
            <div style={{ marginTop: 10, color: status.type === "error" ? "#b91c1c" : "#166534", fontWeight: 800 }}>
              {status.msg}
            </div>
          )}

          {/* Second disclaimer near submit */}
          <div style={{ marginTop: 12, fontSize: 12, color: "#222", fontWeight: 800 }}>
            DISCLAIMER: Illustrative purposes only. Not a Loan Estimate, not a rate lock, not a loan approval. Get an
            official Loan Estimate and talk to a mortgage professional before choosing a loan.
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>{value}</div>
    </div>
  );
}