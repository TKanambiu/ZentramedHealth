import { supabase } from "@/integrations/supabase/client";

export type Offer = {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string | null;
  description: string;
  available: number;
};
export type DeliveryZone = { id: string; label: string; fee: number; window: string };
export type CheckoutCatalogue = { items: Offer[]; zones: DeliveryZone[] };
export type OrderArguments = {
  p_request: string;
  p_product: string;
  p_quantity: number;
  p_zone: string;
  p_total: number;
  p_name: string;
  p_phone: string;
  p_address: string;
};
export type Receipt = { reference: string; total: number; window: string };

type ServerResult<T> = PromiseLike<{ data: T | null; error: unknown }>;
const rpc = supabase as unknown as {
  rpc(name: "cod_catalogue"): ServerResult<CheckoutCatalogue>;
  rpc(name: "cod_place_order", params: OrderArguments): ServerResult<Receipt | { error: string }>;
};

export const codQueryKey = ["cod-catalogue"];
export async function fetchCodCatalogue(): Promise<CheckoutCatalogue> {
  const { data, error } = await rpc.rpc("cod_catalogue");
  if (error || !data) throw new Error("Checkout is unavailable.");
  return data;
}
export async function placeCodOrder(params: OrderArguments) {
  const { data, error } = await rpc.rpc("cod_place_order", params);
  if (error || !data)
    throw new Error(
      "Order confirmation was not received. Retry with the same details to avoid a duplicate.",
    );
  return data;
}
export const codTotal = (price: number, quantity: number, fee: number) =>
  (Math.round(price * 100) * quantity + Math.round(fee * 100)) / 100;
export const formatCod = (amount: number) =>
  `KSh ${amount.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
