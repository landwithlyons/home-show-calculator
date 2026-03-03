import "./app.css";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

/** ---------- helpers ---------- */
function clamp(n, min = 0) {
  const x = Number.isFinite(n) ? n : 0;
  return Math.max(min, x);
}
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function money(n) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function monthlyPI(P, aprPct, years) {
  const p = clamp(P, 0);
  const r = clamp(aprPct, 0) / 100 / 12;
  const n = clamp(years, 1) * 12;
  if (p === 0) return 0;
  if (r === 0) return p / n;
  const pow = Math.pow(1 + r, n);
  return (p * r * pow) / (pow - 1);
}
function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

/** ---------- loan defaults (placeholders w/ disclaimers) ---------- */
const LOAN_TYPES = [
  { key: "CONV", label: "Conventional" },
  { key: "FHA", label: "FHA" },
  { key: "VA", label: "VA" },
  { key: "USDA", label: "USDA" },
];

/**
 * Mortgage insurance / fees are *illustrative placeholders*.
 * Users can adjust rates in UI; we keep a big disclaimer.
 */
function getLoanPreset(loanType) {
  switch (loanType) {
    case "FHA":
      return {
        miType: "MIP (placeholder)",
        miRateAnnual: 0.55,       // FHA annual MIP varies; placeholder
        upfrontFeePercent: 1.75,  // FHA UFMIP placeholder
        financedUpfrontFee: true,
      };
    case "VA":
      return {
        miType: "None (VA has no monthly MI)",
        miRateAnnual: 0.0,
        upfrontFeePercent: 2.15,  // VA funding fee varies; placeholder
        financedUpfrontFee: true,
      };
    case "USDA":
      return {
        miType: "USDA fees (placeholder)",
        miRateAnnual: 0.35,       // USDA annual fee placeholder
        upfrontFeePercent: 1.0,   // USDA upfront guarantee fee placeholder
        financedUpfrontFee: true,
      };
    case "CONV":
    default:
      return {
        miType: "PMI (placeholder)",
        miRateAnnual: 0.50,       // your request: 0.50% placeholder
        upfrontFeePercent: 0.0,
        financedUpfrontFee: false,
      };
  }
}

function buildCopySummary(calc, inputs) {
  const lines = [
    "Home Payment Estimator (Illustrative Only)",
    "----------------------------------------",
    `Loan type: ${inputs.loanType}`,
    `Purchase Price: ${money(calc.price)}`,
    `Down Payment: ${money(calc.downDollar)} (${round2(calc.downPct)}%)`,
    `Base Loan Amount: ${money(calc.baseLoan)}`,
    `Upfront fee financed: ${calc.financedUpfrontFee ? "Yes" : "No"} (${round2(calc.upfrontFeePercent)}%)`,
    `Final Loan Amount: ${money(calc.finalLoan)}`,
    "",
    "Monthly Breakdown:",
    `P&I: ${money(calc.pi)}`,
    `Taxes: ${money(calc.taxesM)}`,
    `HOI: ${money(calc.hoiM)}`,
    `MI/Fee (est.): ${money(calc.miM)}`,
    `HOA: ${money(calc.hoaM)}`,
    `PITI: ${money(calc.piti)}`,
    `Total (PITI + HOA): ${money(calc.total)}`,
    "",
    `Monthly debts entered: ${money(calc.debtsM)}`,
    `Front-end DTI (housing/income): ${round2(calc.frontDTI * 100)}%`,
    `Back-end DTI ((housing+debts)/income): ${round2(calc.backDTI * 100)}%`,
    "",
    `Income needed (housing-only @ 42% max): ${money(calc.requiredIncomeHousingOnlyM)} / mo (~${money(calc.requiredIncomeHousingOnlyA)} / yr)`,
    `Income needed (housing+debts @ 42% max): ${money(calc.requiredIncomeWithDebtsM)} / mo (~${money(calc.requiredIncomeWithDebtsA)} / yr)`,
    "",
    `Assumptions: Taxes=${money(inputs.taxesAnnual)}/yr, HOI=${money(inputs.hoiAnnual)}/yr, MI placeholder=${round2(inputs.miRateAnnual)}%/yr (if applicable)`,
    "",
    "DISCLAIMER: Illustrative purposes only and NOT a Loan Estimate, rate lock, or approval. Actual payment, MI/fees, eligibility vary by program, credit, taxes/insurance, HOA, and underwriting. Talk to a mortgage professional and request an official Loan Estimate before choosing a loan.",
  ];
  return lines.join("\n");
}

/** ---------- app shell ---------- */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<EstimatorPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="container">
      <div className="card">
        <div className="cardTitle"><h2>Not Found</h2></div>
        <p className="small">That page doesn’t exist.</p>
        <Link className="btn" to="/">Back to estimator</Link>
      </div>
    </div>
  );
}

/** ---------- estimator page ---------- */
function EstimatorPage() {
  // Core inputs
  const [loanType, setLoanType] = useState("CONV");
  const [purchasePrice, setPurchasePrice] = useState(350000);

  const [downType, setDownType] = useState("%");
  const [downValue, setDownValue] = useState(5);

  const [rate, setRate] = useState(6.0); // ✅ default 6%
  const [termYears, setTermYears] = useState(30);
  const [hoaMonthly, setHoaMonthly] = useState(0);

  // Taxes/HOI suggested
  const [taxesAnnual, setTaxesAnnual] = useState(0);
  const [hoiAnnual, setHoiAnnual] = useState(0);
  const [taxesTouched, setTaxesTouched] = useState(false);
  const [hoiTouched, setHoiTouched] = useState(false);

  // MI/fees placeholders (editable)
  const preset = useMemo(() => getLoanPreset(loanType), [loanType]);
  const [miRateAnnual, setMiRateAnnual] = useState(preset.miRateAnnual);
  const [upfrontFeePercent, setUpfrontFeePercent] = useState(preset.upfrontFeePercent);
  const [financedUpfrontFee, setFinancedUpfrontFee] = useState(preset.financedUpfrontFee);

  useEffect(() => {
    // When switching loan type, reset placeholders to that type’s defaults
    setMiRateAnnual(preset.miRateAnnual);
    setUpfrontFeePercent(preset.upfrontFeePercent);
    setFinancedUpfrontFee(preset.financedUpfrontFee);
  }, [preset.miRateAnnual, preset.upfrontFeePercent, preset.financedUpfrontFee]);

  const suggestedTaxes = useMemo(() => purchasePrice * 0.01, [purchasePrice]);
  const suggestedHoi = useMemo(() => purchasePrice * 0.008, [purchasePrice]);

  useEffect(() => {
    if (!taxesTouched) setTaxesAnnual(suggestedTaxes);
    if (!hoiTouched) setHoiAnnual(suggestedHoi);
  }, [suggestedTaxes, suggestedHoi, taxesTouched, hoiTouched]);

  // Debts list (optional)
  const [debts, setDebts] = useState([
    { label: "Car payment", amount: 0 },
    { label: "Student loans", amount: 0 },
  ]);

  const totalDebtsM = useMemo(
    () => debts.reduce((sum, d) => sum + clamp(Number(d.amount), 0), 0),
    [debts]
  );

  // Lead capture
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(true);

  const [status, setStatus] = useState({ type: "idle", msg: "" });
  const [copyStatus, setCopyStatus] = useState("");

  const calc = useMemo(() => {
    const price = clamp(purchasePrice, 0);

    const downDollar =
      downType === "%"
        ? (price * clamp(downValue, 0)) / 100
        : clamp(downValue, 0);

    const downDollarCapped = Math.min(downDollar, price);
    const downPct = price > 0 ? (downDollarCapped / price) * 100 : 0;

    const baseLoan = price - downDollarCapped;

    // Upfront fee can be financed or paid in cash; we model “financed” by adding to loan amount.
    const upfrontFeeAmt = (baseLoan * clamp(upfrontFeePercent, 0)) / 100;
    const finalLoan = financedUpfrontFee ? (baseLoan + upfrontFeeAmt) : baseLoan;

    const pi = monthlyPI(finalLoan, rate, termYears);

    const taxesM = clamp(taxesAnnual, 0) / 12;
    const hoiM = clamp(hoiAnnual, 0) / 12;
    const hoaM = clamp(hoaMonthly, 0);

    // MI is monthly based on *base loan* (typical modeling), placeholder logic:
    // - Conventional: apply only if <20% down (you asked for this)
    // - FHA/USDA: apply regardless (placeholder)
    // - VA: 0
    const miAnnualPct = clamp(miRateAnnual, 0);
    let miM = 0;

    if (loanType === "CONV") {
      miM = downPct < 20 ? (baseLoan * (miAnnualPct / 100)) / 12 : 0;
    } else if (loanType === "VA") {
      miM = 0;
    } else {
      // FHA/USDA: placeholder applies
      miM = (baseLoan * (miAnnualPct / 100)) / 12;
    }

    const piti = pi + taxesM + hoiM + miM;
    const total = piti + hoaM;

    // DTI rules (you requested “top range 42%”)
    const dtiTarget = 0.42;

    const requiredIncomeHousingOnlyM = piti / dtiTarget;
    const requiredIncomeHousingOnlyA = requiredIncomeHousingOnlyM * 12;

    const requiredIncomeWithDebtsM = (piti + totalDebtsM) / dtiTarget;
    const requiredIncomeWithDebtsA = requiredIncomeWithDebtsM * 12;

    // If user had an income, we could compute actual DTI; we instead show “implied” DTIs vs required income.
    // For display we compute “back into” DTI using required incomes so it stays intuitive.
    const frontDTI = piti / Math.max(requiredIncomeHousingOnlyM, 1);
    const backDTI = (piti + totalDebtsM) / Math.max(requiredIncomeWithDebtsM, 1);

    // PMI helper still useful for conventional
    const down20Dollar = price * 0.2;
    const extraTo20 = Math.max(0, down20Dollar - downDollarCapped);

    // Rough cash-to-close estimate (simple): down + (if not financed) upfront fee + optional closing-cost placeholder
    // Keep editable placeholder
    return {
      price,
      downDollar: downDollarCapped,
      downPct,
      baseLoan,
      upfrontFeePercent: miAnnualPct ? upfrontFeePercent : upfrontFeePercent,
      upfrontFeeAmt,
      financedUpfrontFee,
      finalLoan,
      pi,
      taxesM,
      hoiM,
      hoaM,
      miM,
      piti,
      total,
      debtsM: totalDebtsM,
      dtiTarget,
      requiredIncomeHousingOnlyM,
      requiredIncomeHousingOnlyA,
      requiredIncomeWithDebtsM,
      requiredIncomeWithDebtsA,
      frontDTI,
      backDTI,
      down20Dollar,
      extraTo20,
    };
  }, [
    purchasePrice, downType, downValue,
    rate, termYears, taxesAnnual, hoiAnnual, hoaMonthly,
    loanType, miRateAnnual, upfrontFeePercent, financedUpfrontFee,
    totalDebtsM
  ]);

  async function copySummary() {
    try {
      const text = buildCopySummary(calc, { taxesAnnual, hoiAnnual, loanType, miRateAnnual });
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

  function addDebt() {
    setDebts((d) => [...d, { label: "Other debt", amount: 0 }]);
  }
  function updateDebt(idx, patch) {
    setDebts((list) => list.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }
  function removeDebt(idx) {
    setDebts((list) => list.filter((_, i) => i !== idx));
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
      consent: true,

      loan_type: loanType,
      mi_type: preset.miType,
      mi_rate_annual: round2(Number(miRateAnnual)),
      upfront_fee_percent: round2(Number(upfrontFeePercent)),
      financed_upfront_fee: !!financedUpfrontFee,

      purchase_price: round2(calc.price),
      down_payment_type: downType,
      down_payment_value: round2(Number(downValue)),
      down_payment_percent: round2(calc.downPct),

      rate: round2(Number(rate)),
      term_years: Number(termYears),

      taxes_annual: round2(Number(taxesAnnual)),
      hoi_annual: round2(Number(hoiAnnual)),
      hoa_monthly: round2(Number(hoaMonthly)),

      loan_amount: round2(calc.finalLoan),
      pi_monthly: round2(calc.pi),
      pmi_monthly: round2(calc.miM),
      piti_monthly: round2(calc.piti),
      total_monthly: round2(calc.total),

      monthly_debts: round2(totalDebtsM),
      debts_json: debts.map((d) => ({ label: String(d.label || ""), amount: round2(Number(d.amount)) })),

      dti_target: calc.dtiTarget,
      required_income_monthly: round2(calc.requiredIncomeWithDebtsM),
      required_income_annual: round2(calc.requiredIncomeWithDebtsA),
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

      setStatus({ type: "success", msg: "Submitted! (Estimate saved.)" });
    } catch (e) {
      setStatus({ type: "error", msg: e.message || "Something went wrong." });
    }
  }

  return (
    <div className="container">
      <div className="topNav">
        <div className="badge">Live Home Show Estimator</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn miniBtn" onClick={copySummary}>Copy summary</button>
          <Link className="btn miniBtn" to="/admin">Admin</Link>
        </div>
      </div>

      <div className="header">
        <div>
          <h1 className="h1">Home Payment Estimator</h1>
          <p className="sub">Illustrative planning estimates. Not a Loan Estimate.</p>
        </div>
      </div>

      <div className="disclaimer">
        <b>IMPORTANT:</b> Illustrative purposes only. This is <b>NOT</b> a Loan Estimate, rate lock, or approval. Actual payment,
        MI/fees, and eligibility vary by program, credit, taxes/insurance, HOA, and underwriting. Talk to a mortgage professional
        and request an <b>official Loan Estimate</b> before choosing a loan.
      </div>

      <div className="grid">
        {/* LEFT */}
        <section className="card">
          <div className="cardTitle">
            <h2>Inputs</h2>
            <div className="pills">
              <button className="btn miniBtn" onClick={resetSuggested}>Reset taxes/HOI</button>
            </div>
          </div>

          <div className="row two">
            <div>
              <div className="label">Loan type</div>
              <select className="select" value={loanType} onChange={(e) => setLoanType(e.target.value)}>
                {LOAN_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
              <div className="hint">
                MI/fees below are <b>placeholders</b> and vary by program & borrower. Adjust as needed.
              </div>
            </div>

            <div>
              <div className="label">Purchase price</div>
              <input className="input" type="number" min="0" value={purchasePrice} onChange={(e) => setPurchasePrice(Number(e.target.value))} />
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
              <input className="input" type="number" min="0" value={downValue} onChange={(e) => setDownValue(Number(e.target.value))} />
            </div>
          </div>

          <div className="row two" style={{ marginTop: 10 }}>
            <div>
              <div className="label">Interest rate (APR %)</div>
              <input className="input" type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
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
                onChange={(e) => { setTaxesTouched(true); setTaxesAnnual(Number(e.target.value)); }}
              />
              <div className="hint">Suggested: {money(suggestedTaxes)} / yr (1% rule)</div>
            </div>

            <div>
              <div className="label">Annual homeowners insurance</div>
              <input
                className="input"
                type="number"
                min="0"
                value={hoiAnnual}
                onChange={(e) => { setHoiTouched(true); setHoiAnnual(Number(e.target.value)); }}
              />
              <div className="hint">Suggested: {money(suggestedHoi)} / yr (0.8% rule)</div>
            </div>
          </div>

          <div className="row two" style={{ marginTop: 10 }}>
            <div>
              <div className="label">HOA (monthly, optional)</div>
              <input className="input" type="number" min="0" value={hoaMonthly} onChange={(e) => setHoaMonthly(Number(e.target.value))} />
            </div>

            <div>
              <div className="label">MI / monthly fee rate (annual % placeholder)</div>
              <input className="input" type="number" min="0" step="0.01" value={miRateAnnual} onChange={(e) => setMiRateAnnual(Number(e.target.value))} />
              <div className="hint">{preset.miType} — placeholder % per year</div>
            </div>
          </div>

          <div className="row two" style={{ marginTop: 10 }}>
            <div>
              <div className="label">Upfront fee (percent placeholder)</div>
              <input className="input" type="number" min="0" step="0.01" value={upfrontFeePercent} onChange={(e) => setUpfrontFeePercent(Number(e.target.value))} />
              <div className="hint">Applies to FHA/VA/USDA placeholders (varies in real life)</div>
            </div>
            <div>
              <div className="label">Finance upfront fee into loan?</div>
              <select className="select" value={financedUpfrontFee ? "yes" : "no"} onChange={(e) => setFinancedUpfrontFee(e.target.value === "yes")}>
                <option value="yes">Yes (adds to loan amount)</option>
                <option value="no">No (assume paid in cash)</option>
              </select>
            </div>
          </div>

          <div className="callout warn">
            <b>MI note:</b> These MI/fee settings are <b>placeholders</b>. PMI/MIP/fees can vary significantly by loan program, credit, LTV, and rules.
          </div>

          <div className="hr" />

          <div className="cardTitle">
            <h2>Optional debts (for true back-end DTI)</h2>
            <button className="btn miniBtn" onClick={addDebt}>+ Add debt</button>
          </div>

          <div className="small" style={{ marginBottom: 10 }}>
            Enter monthly minimum payments (auto, student loans, credit cards, etc.). Leave at $0 if unknown.
          </div>

          {debts.map((d, idx) => (
            <div className="row two" key={idx} style={{ marginBottom: 10 }}>
              <input
                className="input"
                placeholder="Debt label"
                value={d.label}
                onChange={(e) => updateDebt(idx, { label: e.target.value })}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  type="number"
                  min="0"
                  placeholder="Monthly amount"
                  value={d.amount}
                  onChange={(e) => updateDebt(idx, { amount: Number(e.target.value) })}
                />
                <button className="btn miniBtn" onClick={() => removeDebt(idx)}>Remove</button>
              </div>
            </div>
          ))}

          <div className="callout info">
            <b>Total monthly debts:</b> {money(totalDebtsM)}
          </div>
        </section>

        {/* RIGHT */}
        <section className="card sticky">
          <div className="cardTitle">
            <h2>Results</h2>
            {copyStatus ? <div className="small">{copyStatus}</div> : <div className="small">Updated live</div>}
          </div>

          <div className="kpiGrid">
            <KPI label="Total monthly (PITI + HOA)" value={`${money(calc.total)} / mo`} />
            <KPI label="PITI" value={`${money(calc.piti)} / mo`} />
            <KPI label="Final loan amount" value={money(calc.finalLoan)} />
            <KPI label="Down payment" value={`${money(calc.downDollar)} (${round2(calc.downPct)}%)`} />
          </div>

          <div className="callout info">
            <div><b>Payment breakdown</b></div>
            <div className="small" style={{ marginTop: 8, lineHeight: 1.45 }}>
              P&amp;I: {money(calc.pi)} / mo<br/>
              Taxes: {money(calc.taxesM)} / mo<br/>
              HOI: {money(calc.hoiM)} / mo<br/>
              MI/Fee (est.): {money(calc.miM)} / mo<br/>
              HOA: {money(calc.hoaM)} / mo
            </div>
          </div>

          <div className="callout warn">
            <div><b>Conventional PMI helper</b></div>
            <div className="small" style={{ marginTop: 8, lineHeight: 1.45 }}>
              20% down target: {money(calc.down20Dollar)}<br/>
              Extra to reach 20%: {calc.extraTo20 > 0 ? money(calc.extraTo20) : "Already at/above 20%"}
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              (Applies mainly to conventional PMI; FHA/USDA MI rules differ.)
            </div>
          </div>

          <div className="callout good">
            <div><b>Income needed (housing-only @ 42% max)</b></div>
            <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900 }}>
              {money(calc.requiredIncomeHousingOnlyM)} / month
            </div>
            <div className="small">(~{money(calc.requiredIncomeHousingOnlyA)} / year)</div>
          </div>

          <div className="callout good">
            <div><b>Income needed (housing + debts @ 42% max)</b></div>
            <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900 }}>
              {money(calc.requiredIncomeWithDebtsM)} / month
            </div>
            <div className="small">(~{money(calc.requiredIncomeWithDebtsA)} / year)</div>
            <div className="small" style={{ marginTop: 8 }}>
              Uses total debts entered: {money(calc.debtsM)} / mo
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

/** ---------- admin page ---------- */
function AdminPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState(() => sessionStorage.getItem("ADMIN_PASSWORD") || "");
  const [isAuthed, setIsAuthed] = useState(() => !!sessionStorage.getItem("ADMIN_PASSWORD"));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  async function login() {
    if (!pw.trim()) return;
    sessionStorage.setItem("ADMIN_PASSWORD", pw.trim());
    setIsAuthed(true);
    await load();
  }

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const pass = sessionStorage.getItem("ADMIN_PASSWORD") || "";
      const res = await fetch(`/.netlify/functions/getLeads?q=${encodeURIComponent(q)}`, {
        headers: { "x-admin-password": pass },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load leads");
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      setErr(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  async function update(id, patch) {
    setErr("");
    try {
      const pass = sessionStorage.getItem("ADMIN_PASSWORD") || "";
      const res = await fetch("/.netlify/functions/updateLead", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pass },
        body: JSON.stringify({ id, patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load();
    } catch (e) {
      setErr(e.message || "Error");
    }
  }

  function exportCsv() {
    const cols = [
      "created_at","first_name","phone","email","loan_type","purchase_price","down_payment_percent",
      "rate","term_years","piti_monthly","total_monthly","monthly_debts","required_income_monthly",
      "contacted","notes"
    ];
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [
      cols.join(","),
      ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (isAuthed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  if (!isAuthed) {
    return (
      <div className="container">
        <div className="card">
          <div className="cardTitle"><h2>Admin Login</h2></div>
          <div className="small">Enter the admin password (stored in Netlify env var).</div>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button className="btn primary" onClick={login}>Login</button>
            <Link className="btn" to="/">Back</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="topNav">
        <div className="badge">Admin Dashboard</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn miniBtn" onClick={() => { sessionStorage.removeItem("ADMIN_PASSWORD"); setIsAuthed(false); }}>Logout</button>
          <button className="btn miniBtn" onClick={() => navigate("/")}>Estimator</button>
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">
          <h2>Leads</h2>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input className="input" style={{ width: 260 }} placeholder="Search name/email/phone" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className={`btn miniBtn ${loading ? "pulse" : ""}`} onClick={load} disabled={loading}>Refresh</button>
            <button className="btn miniBtn" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>

        {err && <div className="error" style={{ marginBottom: 10 }}>{err}</div>}

        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Lead</th>
              <th>Scenario</th>
              <th>DTI / Income</th>
              <th>Contact</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{String(r.created_at || "").replace("T", " ").slice(0, 16)}</td>
                <td>
                  <b>{r.first_name}</b><br/>
                  <span className="small">{r.phone}<br/>{r.email}</span>
                </td>
                <td className="small">
                  {r.loan_type} • {money(Number(r.purchase_price || 0))}<br/>
                  Down: {round2(Number(r.down_payment_percent || 0))}% • Rate: {round2(Number(r.rate || 0))}%<br/>
                  PITI: {money(Number(r.piti_monthly || 0))} • Total: {money(Number(r.total_monthly || 0))}
                </td>
                <td className="small">
                  Debts: {money(Number(r.monthly_debts || 0))}<br/>
                  Req income: {money(Number(r.required_income_monthly || 0))} / mo
                </td>
                <td className="small">
                  Contacted: <b>{r.contacted ? "Yes" : "No"}</b>
                </td>
                <td>
                  <textarea
                    className="input"
                    style={{ minHeight: 60 }}
                    defaultValue={r.notes || ""}
                    onBlur={(e) => update(r.id, { notes: e.target.value })}
                    placeholder="Add notes…"
                  />
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn miniBtn" onClick={() => update(r.id, { contacted: !r.contacted })}>
                      {r.contacted ? "Unmark" : "Mark contacted"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="7" className="small">No leads found.</td></tr>
            )}
          </tbody>
        </table>

        <div className="small" style={{ marginTop: 10 }}>
          Admin uses a Netlify Function + Supabase service role key. Keep the admin password private.
        </div>
      </div>
    </div>
  );
}