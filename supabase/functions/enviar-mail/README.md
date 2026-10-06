# Envío de mails a médicos (backend)

Esta función (`enviar-mail`) manda el resumen **desde la casilla de Gmail de la clínica**
hacia el email del médico, **sin abrir nada** (el botón «✉️ Enviar por mail» lo hace solo).

Mientras no esté configurada, el botón sigue funcionando: abre el **compose de Gmail**
prellenado para enviarlo a mano. Al terminar estos pasos, pasa a enviarse automático.

---

## 1) Preparar la casilla de Gmail (una sola vez)

Elegí **qué Gmail** va a mandar los correos (ej. `turnos.clinica@gmail.com`).

1. Entrá a esa cuenta → **Gestionar tu cuenta de Google** → **Seguridad**.
2. Activá la **Verificación en dos pasos** (si no estaba).
3. Buscá **Contraseñas de aplicaciones** (App passwords):
   https://myaccount.google.com/apppasswords
4. Creá una nueva (nombre libre, ej. «SAM»). Google te da **16 letras** (ej. `abcd efgh ijkl mnop`).
   Guardalas: esa es la `GMAIL_APP_PASSWORD` (va **sin espacios**: `abcdefghijklmnop`).

> Es una clave que solo sirve para esta app; se puede revocar cuando quieras.
> Tu contraseña normal de Gmail **no** se usa ni se guarda en ningún lado.

---

## 2) Cargar los secretos en Supabase

En el proyecto de Supabase → **Edge Functions → Secrets** (o **Project Settings → Edge Functions**),
agregá dos secretos:

| Nombre | Valor |
|---|---|
| `GMAIL_USER` | la casilla, ej. `turnos.clinica@gmail.com` |
| `GMAIL_APP_PASSWORD` | las 16 letras, sin espacios |

(Los otros — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — ya los pone Supabase solo.)

Por CLI sería:
```bash
supabase secrets set GMAIL_USER="turnos.clinica@gmail.com" GMAIL_APP_PASSWORD="abcdefghijklmnop"
```

---

## 3) Publicar la función

**Opción A — con la CLI de Supabase** (desde la carpeta del proyecto):
```bash
supabase functions deploy enviar-mail
```

**Opción B — desde el panel de Supabase** (sin instalar nada):
1. **Edge Functions → Create a new function**, nombre exacto: `enviar-mail`.
2. Pegá el contenido de `index.ts` (el archivo de al lado) y **Deploy**.

> La función queda protegida: solo la pueden usar usuarios **logueados** y que estén en
> la tabla `autorizados`. La clave de Gmail nunca llega al navegador.

---

## 4) Probar

En la app: **Dashboard → Estadísticas → Médico**, elegí un médico **con email cargado**
y tocá **✉️ Enviar por mail**. Debería decir «✅ Mail enviado».

### Si algo falla
- «Falta configurar GMAIL_USER…» → faltan los secretos (paso 2).
- «Usuario no autorizado» → tu email no está en la tabla `autorizados`.
- Si el envío por SMTP no saliera, el botón **abre Gmail** igual para mandarlo a mano
  (no se pierde nada).

---

**Nota técnica:** la función usa el SMTP de Gmail (`smtp.gmail.com:465`) vía
[denomailer](https://deno.land/x/denomailer). El remitente es siempre `GMAIL_USER`.
El cuerpo es el resumen **sin valores** (solo control), igual que el que se copia para WhatsApp.
