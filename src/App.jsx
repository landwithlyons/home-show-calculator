import "./app.css";
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
    `Assumptions: Taxes=${formatMoney(inputs.taxesAnnual)}/yr, HOI=${formatMoney(
      inputs.hoiAnnual
    )}/yr, PMI placeholder=0.50%/yr if <20% down`,
    "",
    "DISCLAIMER: Illustrative purposes only and NOT a Loan Estimate, rate lock, or approval. Actual payment/PMI/eligibility vary by program, credit, taxes/insurance, HOA, and underwriting. Talk to a mortgage professional and request an official Loan Estimate before choosing a loan.",
  ];
  return lines.join("\n");
}

export default function App() {
  // Inputs
  const [purchasePrice, setPurchasePrice] = useState(350000);
  const [downType, setDownType] = useState("%");
  const [downValue, setDownValue] = useState(5);

  const [rate, setRate] = useState(6.0); // ✅ default 6%
  const [termYears, setTermYears] = useState(30);
  const [hoaMonthly, setHoaMonthly] = useState(0);

  // Taxes/HOI (auto-suggested unless user edits)
  const [taxesAnnual, setTaxesAnnual] = useState(0);
  const [hoiAnnual, setHoiAnnual] = useState(0);
  const [taxesTouched, setTaxesTouched] = useState(false);
  const [hoiTouched, setHoiTouched] = useState(false);

  // Lead capture
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(true);

  const [status, setStatus] = useState({ type: "idle", msg: "" });
  const [copyStatus, setCopyStatus] = useState("");

  const suggestedTaxes = useMemo(() => purchasePrice * 0.01, [purchasePrice]);
  const suggestedHoi = useMemo(() => purchasePrice * 0.008, [purchasePrice]);

  useEffect(() => {
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

    // “Backwards” housing-only income needed @ 42% max
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
      setCopyStatus("Copied.");
      setTimeout(() => setCopyStatus(""), 2000);
    } catch {
      setCopyStatus("Copy failed.");
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
      event_source: "Duluth Home Show 2026",
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

      setStatus({ type: "success", msg: "Submitted! (Illustrative estimate saved.)" });
    } catch (e) {
      setStatus({ type: "error", msg: e.message || "Something went wrong." });
    }
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="h1">Home Payment Estimator</h1>
          <p className="sub">Quick planning estimates for a home show conversation.</p>
        </div>
        <button className="btn" onClick={copySummary}>Copy summary</button>
      </div>

      <div className="disclaimer">
        <b>IMPORTANT:</b> Illustrative purposes only. This is <b>NOT</b> a Loan Estimate, rate lock, or approval. Actual payment,
        PMI, and eligibility vary by loan program, credit, taxes/insurance, HOA, and underwriting. Talk to a mortgage professional
        and request an <b>official Loan Estimate</b> before choosing a loan.
      </div>

      <div className="grid">
        {/* LEFT: INPUTS */}
        <section className="card">
          <div className="cardTitle">
            <h2>Inputs</h2>
            <div className="pills">
              <button className="btn" onClick={resetSuggested}>Reset taxes/HOI</button>
            </div>
          </div>

          <div className="row">
            <div>
              <div className="label">Purchase price</div>
              <input
                className="input"
                type="number"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="row two" style={{ marginTop: 10 }}>
            <div>
              <div className="label">Down type</div>
              <select className="select" value={downType} onChange={(e) => setDownType(e.target.value)}>
                <option value="%">%</option>
                <option value="$">$</option>
              </select>
            </div>
            <div>
              <div className="label">Down payment ({downType})</div>
              <input
                className="input"
                type="number"
                min="0"
                value={downValue}
                onChange={(e) => setDownValue(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="row two" style={{ marginTop: 10 }}>
            <div>
              <div className="label">Interest rate (APR %)</div>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              />
            </div>
            <div>
              <div className="label">Term (years)</div>
              <select className="select" value={termYears} onChange={(e) => setTermYears(Number(e.target.value))}>
                <option value={30}>30</option>
                <option value={20}>20</option>
                <option value={15}>15</option>
                <option value={10}>10</option>
              </select>
            </div>
          </div>

          <div className="row two" style={{ marginTop: 10 }}>
            <div>
              <div className="label">Annual property taxes</div>
              <input
                className="input"
                type="number"
                min="0"
                value={taxesAnnual}
                onChange={(e) => {
                  setTaxesTouched(true);
                  setTaxesAnnual(Number(e.target.value));
                }}
              />
              <div className="hint">Suggested: {formatMoney(suggestedTaxes)} / yr (1% rule)</div>
            </div>

            <div>
              <div className="label">Annual homeowners insurance</div>
              <input
                className="input"
                type="number"
                min="0"
                value={hoiAnnual}
                onChange={(e) => {
                  setHoiTouched(true);
                  setHoiAnnual(Number(e.target.value));
                }}
              />
              <div className="hint">Suggested: {formatMoney(suggestedHoi)} / yr (0.8% rule)</div>
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <div>
              <div className="label">HOA (monthly, optional)</div>
              <input
                className="input"
                type="number"
                min="0"
                value={hoaMonthly}
                onChange={(e) => setHoaMonthly(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="callout warn">
            <b>PMI note:</b> PMI uses a <b>0.50%</b> placeholder when under 20% down. Actual PMI can vary widely.
          </div>
        </section>

        {/* RIGHT: RESULTS + LEAD CAPTURE */}
        <section className="card sticky">
          <div className="cardTitle">
            <h2>Results</h2>
            {copyStatus ? <div className="small">{copyStatus}</div> : <div className="small">Updated live</div>}
          </div>

          <div className="kpiGrid">
            <KPI label="Total monthly (PITI + HOA)" value={`${formatMoney(calc.total)} / mo`} />
            <KPI label="PITI" value={`${formatMoney(calc.piti)} / mo`} />
            <KPI label="Loan amount" value={formatMoney(calc.loan)} />
            <KPI label="Down payment" value={`${formatMoney(calc.downDollar)} (${round2(calc.downPct)}%)`} />
          </div>

          <div className="callout info">
            <div><b>Payment breakdown</b></div>
            <div className="small" style={{ marginTop: 8, lineHeight: 1.45 }}>
              P&amp;I: {formatMoney(calc.pi)} / mo<br/>
              Taxes: {formatMoney(calc.taxesM)} / mo<br/>
              HOI: {formatMoney(calc.hoiM)} / mo<br/>
              PMI (est.): {formatMoney(calc.pmiM)} / mo<br/>
              HOA: {formatMoney(calc.hoaM)} / mo
            </div>
          </div>

          <div className="callout warn">
            <div><b>PMI avoidance helper</b></div>
            <div className="small" style={{ marginTop: 8, lineHeight: 1.45 }}>
              20% down target: {formatMoney(calc.down20Dollar)}<br/>
              Extra to reach 20%: {calc.extraTo20 > 0 ? formatMoney(calc.extraTo20) : "Already at/above 20%"}
            </div>
          </div>

          <div className="callout good">
            <div><b>Income needed (housing-only @ 42% max)</b></div>
            <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900 }}>
              {formatMoney(calc.requiredIncomeM)} / month
            </div>
            <div className="small">(~{formatMoney(calc.requiredIncomeA)} / year)</div>
            <div className="small" style={{ marginTop: 8 }}>
              Excludes other monthly debts (auto, student loans, credit cards, etc.).
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="label">Save my estimate & follow up</div>

            <div className="row two">
              <input className="input" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <input className="input" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              It’s OK to contact me about this estimate.
            </label>

            <button
              className="btn primary"
              style={{ width: "100%", marginTop: 12 }}
              onClick={submitLead}
              disabled={status.type === "loading"}
            >
              {status.type === "loading" ? "Submitting..." : "Submit"}
            </button>

            {status.type === "success" && <div className="success" style={{ marginTop: 10 }}>{status.msg}</div>}
            {status.type === "error" && <div className="error" style={{ marginTop: 10 }}>{status.msg}</div>}

            <div className="small" style={{ marginTop: 10 }}>
              <b>DISCLAIMER:</b> Illustrative purposes only. Not a Loan Estimate, not a rate lock, not a loan approval.
              Get an official Loan Estimate and talk to a mortgage professional before choosing a loan.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function KPI({ label, value }) {
  return (
    <div className="kpi">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}