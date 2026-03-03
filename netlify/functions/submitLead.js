import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = JSON.parse(event.body || "{}");

    const { first_name, phone, email } = payload;

    // Basic validation
    if (!first_name || !phone || !email) {
      return json(400, {
        error: "First name, phone, and email are required.",
      });
    }

    const { error } = await supabase
      .from("leads")
      .insert([payload]);

    if (error) {
      return json(500, { error: error.message });
    }

    return json(200, { success: true });
  } catch (err) {
    return json(400, { error: "Invalid request body." });
  }
};