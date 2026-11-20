CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
BEGIN
  IF caller_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('zentramed-health:first-admin', 0));

  SELECT lower(u.email)
    INTO caller_email
    FROM auth.users AS u
   WHERE u.id = caller_id
     AND u.email_confirmed_at IS NOT NULL;

  IF caller_email IS DISTINCT FROM 'admin@zentramedhealth.co.ke' THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.user_roles AS ur
     WHERE ur.user_id = caller_id
       AND ur.role = 'admin'::public.app_role
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.user_roles AS ur
     WHERE ur.role = 'admin'::public.app_role
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (caller_id, 'admin'::public.app_role);

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_first_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;