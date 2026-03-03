import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,x-admin-password",
  },
  body: JSON.stringify(body),
});

function leadEmailHtml(row) {
  return `
  <div style="font-family:Arial,sans-serif;line-height:1.4">
    <h2>New Home Show Lead</h2>
    <p><b>Name:</b> ${row.first_name}<br/>
       <b>Phone:</b> ${row.phone}<br/>
       <b>Email:</b> ${row.email}</p>

    <h3>Scenario</h3>
    <p>
      <b>Loan type:</b> ${row.loan_type}<br/>
      <b>Price:</b> $${Number(row.purchase_price||0).toLocaleString()}<br/>
      <b>Down %:</b> ${Number(row.down_payment_percent||0).toFixed(2)}%<br/>
      <b>Rate:</b> ${Number(row.rate||0).toFixed(2)}%<br/>
      <b>PITI:</b> $${Number(row.piti_monthly||0).toFixed(2)}<br/>
      <b>Total:</b> $${Number(row.total_monthly||0).toFixed(2)}<br/>
      <b>Monthly debts:</b> $${Number(row.monthly_debts||0).toFixed(2)}<br/>
      <b>Required income (42% cap):</b> $${Number(row.required_income_monthly||0).toFixed(2)}/mo
    </p>

    <p style="color:#666;font-size:12px">
      DISCLAIMER: Illustrative only. Not a Loan Estimate, rate lock, or approval.
    </p>
  </div>`;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: json(204, {}).headers, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const payload = JSON.parse(event.body || "{}");
    const { first_name, phone, email } = payload;

    if (!first_name || !phone || !email) {
      return json(400, { error: "First name, phone, and email are required." });
    }

    // Insert lead
    const { data, error } = await supabase
      .from("leads")
      .insert([payload])
      .select("*")
      .single();

    if (error) return json(500, { error: error.message });

    // Email notify (optional)
    const notifyTo = process.env.NOTIFY_EMAIL_TO;
    const from = process.env.NOTIFY_EMAIL_FROM;

    if (resend && notifyTo && from) {
      try {
        await resend.emails.send({
          from,
          to: notifyTo,
          subject: `New Home Show Lead: ${data.first_name}`,
          html: leadEmailHtml(data),
        });

        // Optional: email the consumer
        if (process.env.SEND_CONSUMER_EMAIL === "true") {
          await resend.emails.send({
            from,
            to: data.email,
            subject: "Your Home Payment Estimate (Illustrative)",
            html: `
              <div style="font-family:Arial,sans-serif;line-height:1.4">
                <h2>Your Estimate (Illustrative Only)</h2>
                <p>Thanks! Here’s a copy of what you entered. A mortgage professional will follow up if requested.</p>
                ${leadEmailHtml(data)}
                <p style="color:#666;font-size:12px">
                  DISCLAIMER: Illustrative only. Not a Loan Estimate, rate lock, or approval.
                </p>
              </div>
            `,
          });
        }
      } catch (e) {
        // Don’t fail the lead capture if email fails
        console.log("Email send failed:", e?.message || e);
      }
    }

    return json(200, { success: true, id: data.id });
  } catch {
    return json(400, { error: "Invalid request body." });
  }
};