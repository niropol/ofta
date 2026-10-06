// ─────────────────────────────────────────────────────────────────────────────
//  SAM — Edge Function «enviar-mail»
//  Envía un correo DESDE la casilla de Gmail de la clínica (SMTP + contraseña de
//  aplicación) hacia el email del médico. La llama el frontend con
//  sb.functions.invoke('enviar-mail', { body: { to, subject, text } }).
//
//  Seguridad:
//   - Requiere usuario autenticado (Supabase valida el JWT: verify_jwt = true).
//   - Además verifica que el email del usuario esté en la tabla `autorizados`.
//   - La contraseña de Gmail NUNCA viaja al navegador: vive como secreto del
//     proyecto (GMAIL_USER / GMAIL_APP_PASSWORD).
//
//  Secretos a cargar (Supabase ▸ Edge Functions ▸ Secrets, o `supabase secrets set`):
//     GMAIL_USER           = la casilla, ej. turnos.clinica@gmail.com
//     GMAIL_APP_PASSWORD   = contraseña de aplicación de 16 letras (requiere 2FA)
//  (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta solo.)
// ─────────────────────────────────────────────────────────────────────────────
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GMAIL_USER = Deno.env.get("GMAIL_USER");
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return json({ error: "Falta configurar GMAIL_USER / GMAIL_APP_PASSWORD en los secretos del proyecto." }, 500);
    }

    // 1) Identificar al usuario por su token (lo manda sb.functions.invoke).
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user?.email) return json({ error: "No autenticado." }, 401);

    // 2) Verificar que esté habilitado en la tabla `autorizados`.
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: aut } = await admin
      .from("autorizados")
      .select("email")
      .ilike("email", user.email)
      .maybeSingle();
    if (!aut) return json({ error: "Usuario no autorizado para enviar correos." }, 403);

    // 3) Datos del correo.
    const { to, subject, text } = await req.json().catch(() => ({}));
    if (!to || !subject || !text) return json({ error: "Faltan datos: to, subject, text." }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) return json({ error: "Email de destino inválido." }, 400);

    // 4) Enviar por SMTP de Gmail.
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    });
    await client.send({
      from: GMAIL_USER,
      to: String(to),
      subject: String(subject),
      content: String(text),
    });
    await client.close();

    return json({ ok: true, to });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
