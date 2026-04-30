-- ────────────────────────────────────────────────────────────────────
-- Limpia cuentas zombies (registradas sin confirmación de email)
-- ────────────────────────────────────────────────────────────────────
-- Cuándo correr esto:
--   - Después de apagar "Confirm email" en Supabase Auth
--   - Si reintentando registrarte con un email ya usado te dice
--     "Ese correo ya está registrado" pero NUNCA pudiste loguear
--
-- Cómo correr:
--   1) Supabase Dashboard → SQL Editor → New query
--   2) Pegar este SQL
--   3) Run
--
-- ATENCIÓN: borra usuarios. Solo úsalo en un proyecto donde no haya
-- usuarios reales con tours/datos importantes que perder.
-- ────────────────────────────────────────────────────────────────────

-- 1) Ver primero cuáles son las zombies (NO borra, solo muestra)
SELECT id, email, created_at, confirmed_at, last_sign_in_at
FROM auth.users
WHERE confirmed_at IS NULL
   OR (confirmed_at IS NOT NULL AND last_sign_in_at IS NULL);

-- 2) Si la lista coincide con lo que esperas, ejecutá esto para borrarlas:
-- DELETE FROM auth.users
-- WHERE confirmed_at IS NULL;

-- 3) Alternativa — confirmar manualmente todas las cuentas existentes
--    (más seguro si algún test sí lo querés conservar):
-- UPDATE auth.users
-- SET confirmed_at = NOW(), email_confirmed_at = NOW()
-- WHERE confirmed_at IS NULL;
