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
    "Access-Control-Allow-Headers": "Content-Type,x-admin-password",
  },
  body: JSON.stringify(body),
});

function requireAdmin(event) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const got = event.headers?.["x-admin-password"] || event.headers?.["X-Admin-Password"] || "";
  return expected && got && got === expected;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: json(204, {}).headers, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!requireAdmin(event)) return json(401, { error: "Unauthorized" });

  try {
    const { id, patch } = JSON.parse(event.body || "{}");
    if (!id || !patch || typeof patch !== "object") return json(400, { error: "Missing id/patch" });

    // allowlist only
    const allowed = {};
    if ("contacted" in patch) allowed.contacted = !!patch.contacted;
    if ("notes" in patch) allowed.notes = String(patch.notes || "");

    const { error } = await supabase.from("leads").update(allowed).eq("id", id);
    if (error) return json(500, { error: error.message });

    return json(200, { success: true });
  } catch {
    return json(400, { error: "Invalid request body." });
  }
};