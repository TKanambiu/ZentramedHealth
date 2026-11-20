DROP FUNCTION IF EXISTS public.claim_first_admin();

CREATE OR REPLACE FUNCTION public.assign_first_admin_for_confirmed_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NULL
     OR pg_catalog.lower(NEW.email) IS DISTINCT FROM 'admin@zentramedhealth.co.ke' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('zentramed-health:first-admin', 0)
  );

  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles AS ur
     WHERE ur.role = 'admin'::public.app_role
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_first_admin_for_confirmed_email() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS assign_first_admin_after_email_confirmation ON auth.users;
CREATE TRIGGER assign_first_admin_after_email_confirmation
AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.assign_first_admin_for_confirmed_email();