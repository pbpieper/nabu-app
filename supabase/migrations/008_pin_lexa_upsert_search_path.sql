-- Migration 008: Pin search_path on lexa_upsert_terms
--
-- Why: Supabase security advisor flagged `lexa_upsert_terms` as having a
-- mutable role search_path. The function is SECURITY INVOKER so the blast
-- radius is bounded, but pinning the search_path prevents future name-
-- resolution surprises if the same name is overridden in another schema.
--
-- Purely additive. Function body unchanged. RLS unaffected.

ALTER FUNCTION public.lexa_upsert_terms(JSONB) SET search_path = 'pg_catalog', 'public';
