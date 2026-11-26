BEGIN;

-- Staff opt individual items into checkout only after checking price and stock.
CREATE TABLE public.cod_offers (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  units_available integer NOT NULL CHECK (units_available BETWEEN 0 AND 1000000),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 2000)
);
CREATE TABLE public.cod_delivery (
  zone text PRIMARY KEY CHECK (zone ~ '^[a-z0-9-]{1,30}$'),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 3 AND 100),
  fee numeric(12,2) NOT NULL CHECK (fee >= 0),
  window_text text NOT NULL CHECK (length(trim(window_text)) BETWEEN 3 AND 100),
  enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE public.cod_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price numeric(12,2) NOT NULL,
  delivery_fee numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL,
  delivery_zone text NOT NULL,
  delivery_window text NOT NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  delivery_address text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','confirmed','dispatched','delivered','cancelled'))
);
CREATE INDEX cod_orders_recent_phone ON public.cod_orders (phone, created_at DESC);
ALTER TABLE public.cod_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cod_offers, public.cod_delivery, public.cod_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cod_offers, public.cod_delivery TO authenticated;
GRANT SELECT ON public.cod_orders TO authenticated;
CREATE POLICY "Staff configure cash on delivery offers" ON public.cod_offers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Staff configure delivery zones" ON public.cod_delivery FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Staff read cash on delivery orders" ON public.cod_orders FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE FUNCTION public.cod_catalogue() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'category', p.category_slug, 'price', p.price,
      'image', p.image_url, 'description', o.description, 'available', least(o.units_available, 10)))
      FROM public.cod_offers o JOIN public.products p ON p.id=o.product_id
      WHERE p.price BETWEEN 0.01 AND 99999999 AND p.image_url IS NOT NULL), '[]'::jsonb),
    'zones', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', d.zone, 'label', d.label, 'fee', d.fee, 'window', d.window_text) ORDER BY d.label)
      FROM public.cod_delivery d WHERE d.enabled), '[]'::jsonb)
  );
$$;

CREATE FUNCTION public.cod_place_order(
  p_request uuid, p_product uuid, p_quantity integer, p_zone text, p_total numeric,
  p_name text, p_phone text, p_address text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  prod record; delivery record; saved public.cod_orders%rowtype; computed numeric;
  buyer text := trim(coalesce(p_name, ''));
  phone_value text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  addr text := trim(coalesce(p_address, ''));
BEGIN
  IF phone_value ~ '^0[17][0-9]{8}$' THEN phone_value := '254' || substring(phone_value from 2); END IF;
  IF length(buyer) NOT BETWEEN 2 AND 100 OR phone_value !~ '^254[17][0-9]{8}$'
     OR length(addr) NOT BETWEEN 8 AND 350 OR p_request IS NULL OR p_product IS NULL
     OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 10
     OR p_zone IS NULL OR length(p_zone) > 30 OR p_total IS NULL OR p_total <= 0 THEN
    RETURN jsonb_build_object('error','invalid_details');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO saved FROM public.cod_orders WHERE request_id = p_request;
  IF FOUND THEN
    IF saved.phone <> phone_value OR saved.customer_name <> buyer OR saved.delivery_address <> addr
       OR saved.product_id <> p_product OR saved.quantity <> p_quantity OR saved.total <> p_total OR saved.delivery_zone <> p_zone THEN
      RETURN jsonb_build_object('error','request_mismatch');
    END IF;
    RETURN jsonb_build_object('reference', saved.id, 'total', saved.total, 'window', saved.delivery_window);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(phone_value, 1));
  IF (SELECT count(*) FROM public.cod_orders WHERE phone = phone_value AND created_at > now() - interval '1 hour') >= 3 THEN
    RETURN jsonb_build_object('error','try_later');
  END IF;
  SELECT p.name, p.price, o.units_available INTO prod
  FROM public.products p JOIN public.cod_offers o ON o.product_id = p.id
  WHERE p.id = p_product AND p.image_url IS NOT NULL FOR SHARE OF p FOR UPDATE OF o;
  IF NOT FOUND OR prod.price NOT BETWEEN 0.01 AND 99999999 OR prod.units_available < p_quantity THEN
    RETURN jsonb_build_object('error','stock_changed');
  END IF;
  SELECT fee, window_text INTO delivery FROM public.cod_delivery WHERE zone = p_zone AND enabled FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','delivery_changed'); END IF;
  computed := round(prod.price * p_quantity + delivery.fee, 2);
  IF p_total <> computed THEN RETURN jsonb_build_object('error','price_changed'); END IF;

  INSERT INTO public.cod_orders (request_id,product_id,product_name,quantity,unit_price,delivery_fee,total,
    delivery_zone,delivery_window,customer_name,phone,delivery_address)
  VALUES (p_request,p_product,prod.name,p_quantity,prod.price,delivery.fee,computed,
    p_zone,delivery.window_text,buyer,phone_value,addr) RETURNING * INTO saved;
  UPDATE public.cod_offers SET units_available = units_available - p_quantity WHERE product_id = p_product;
  RETURN jsonb_build_object('reference', saved.id, 'total', saved.total, 'window', saved.delivery_window);
END;
$$;

REVOKE ALL ON FUNCTION public.cod_catalogue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cod_place_order(uuid,uuid,integer,text,numeric,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cod_catalogue() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cod_place_order(uuid,uuid,integer,text,numeric,text,text,text) TO anon, authenticated;

COMMIT;
