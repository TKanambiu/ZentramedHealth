import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DbProduct } from "@/lib/live-catalogue";
import { formatCod } from "@/lib/cod";

type Zone = { zone: string; label: string; fee: number; window_text: string; enabled: boolean };
type Offer = { product_id: string; units_available: number; description: string };
type Order = {
  id: string;
  created_at: string;
  product_name: string;
  quantity: number;
  total: number;
  delivery_zone: string;
  customer_name: string;
  phone: string;
  delivery_address: string;
};
type Result<T> = PromiseLike<{ data: T | null; error: unknown }>;
type Table<T> = {
  upsert(row: T): Result<unknown>;
  select(
    columns: string,
  ): Result<T[]> & {
    order(column: string, opts?: { ascending?: boolean }): { limit(n: number): Result<T[]> };
  };
};
const db = supabase as unknown as {
  from(table: "cod_delivery"): Table<Zone>;
  from(table: "cod_offers"): Table<Offer>;
  from(table: "cod_orders"): Table<Order>;
};
const formClass = "space-y-3 rounded-lg border border-admin-border p-3";
const field =
  "block w-full min-w-0 rounded border border-admin-border bg-admin-background px-2 py-1.5 text-sm text-admin-foreground";
const button =
  "rounded bg-admin-foreground px-3 py-2 text-sm font-semibold text-admin-background hover:bg-admin-accent disabled:opacity-50";

export function CodAdmin({ products }: { products: DbProduct[] }) {
  const [show, setShow] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [sku, setSku] = useState("");
  const [zone, setZone] = useState("nairobi");
  const [workingZone, setWorkingZone] = useState<Zone>({
    zone: "nairobi",
    label: "Nairobi",
    fee: 300,
    window_text: "",
    enabled: false,
  });

  async function refresh() {
    setStatus("");
    const [z, o, r] = await Promise.all([
      db.from("cod_delivery").select("zone,label,fee,window_text,enabled"),
      db.from("cod_offers").select("product_id,units_available,description"),
      db
        .from("cod_orders")
        .select(
          "id,created_at,product_name,quantity,total,delivery_zone,customer_name,phone,delivery_address",
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (z.error || o.error || r.error) {
      setStatus(
        "Checkout database unavailable. Ask the site administrator to apply the checkout migration.",
      );
      return;
    }
    setZones(z.data ?? []);
    setOffers(o.data ?? []);
    setOrders(r.data ?? []);
  }
  useEffect(() => {
    if (show) void refresh();
  }, [show]);
  useEffect(() => {
    setWorkingZone(
      zones.find((z) => z.zone === zone) ?? {
        zone,
        label: zone === "nairobi" ? "Nairobi" : "",
        fee: zone === "nairobi" ? 300 : 0,
        window_text: "",
        enabled: false,
      },
    );
  }, [zone, zones]);
  async function saveZone(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const r = await db.from("cod_delivery").upsert(workingZone);
    if (!r.error) await refresh();
    setStatus(r.error ? "Couldn’t save the zone." : "Delivery zone saved.");
    setBusy(false);
  }
  async function saveOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const units = Number(form.get("units"));
    const r = await db
      .from("cod_offers")
      .upsert({
        product_id: sku,
        units_available: units,
        description: String(form.get("description") ?? "").trim(),
      });
    if (!r.error) await refresh();
    setStatus(r.error ? "Couldn’t save stock." : "Checkout stock saved.");
    setBusy(false);
  }
  return (
    <section className="space-y-4 rounded-lg border border-admin-border bg-admin-surface p-4">
      <button
        type="button"
        aria-expanded={show}
        onClick={() => setShow(!show)}
        className="font-semibold"
      >
        Cash-on-delivery orders {show ? "▾" : "▸"}
      </button>
      {show && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <form className={formClass} onSubmit={saveZone}>
              <h3 className="font-semibold">Delivery zones</h3>
              <p className="text-xs">
                Enable only destinations with a confirmed fee and delivery window. Use a separate
                zone for each different fee.
              </p>
              <label className="block text-sm">
                Zone code
                <input
                  required
                  pattern="[a-z0-9-]{1,30}"
                  className={field}
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  list="cod-zones"
                />
              </label>
              <datalist id="cod-zones">
                {zones.map((z) => (
                  <option key={z.zone} value={z.zone} />
                ))}
              </datalist>
              <label className="block text-sm">
                Customer-facing area or towns
                <input
                  className={field}
                  required
                  minLength={3}
                  maxLength={100}
                  value={workingZone.label}
                  onChange={(e) => setWorkingZone({ ...workingZone, label: e.target.value })}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm">
                  Fee (KSh)
                  <input
                    className={field}
                    required
                    type="number"
                    min={0}
                    max={100000}
                    step=".01"
                    value={Number.isFinite(workingZone.fee) ? workingZone.fee : ""}
                    onChange={(e) =>
                      setWorkingZone({ ...workingZone, fee: e.target.valueAsNumber })
                    }
                  />
                </label>
                <label className="block text-sm">
                  Delivery window
                  <input
                    className={field}
                    required
                    minLength={3}
                    maxLength={100}
                    value={workingZone.window_text}
                    onChange={(e) =>
                      setWorkingZone({ ...workingZone, window_text: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={workingZone.enabled}
                  onChange={(e) => setWorkingZone({ ...workingZone, enabled: e.target.checked })}
                />{" "}
                Enable at checkout
              </label>
              <button className={button} disabled={busy}>
                Save zone
              </button>
            </form>
            <form className={formClass} onSubmit={saveOffer}>
              <h3 className="font-semibold">Checkout stock</h3>
              <p className="text-xs">
                Only opt in confirmed stock with the correct website price. Set quantity to zero to
                stop online checkout.
              </p>
              <label className="block text-sm">
                Product
                <select
                  className={field}
                  value={sku}
                  required
                  onChange={(e) => setSku(e.target.value)}
                >
                  <option value="">Choose a priced product</option>
                  {products
                    .filter((p) => p.price > 0 && p.image_url)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatCod(p.price)})
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm">
                Units available
                <input
                  key={sku}
                  name="units"
                  className={field}
                  type="number"
                  min={0}
                  max={1000000}
                  required
                  defaultValue={offers.find((o) => o.product_id === sku)?.units_available ?? 0}
                />
              </label>
              <label className="block text-sm">
                Product description
                <textarea
                  key={sku + "-description"}
                  name="description"
                  className={field}
                  minLength={10}
                  maxLength={2000}
                  required
                  defaultValue={offers.find((o) => o.product_id === sku)?.description ?? ""}
                />
              </label>
              <button className={button} disabled={busy || !sku}>
                Save stock
              </button>
            </form>
          </div>
          {status && (
            <p role="status" className="text-sm">
              {status}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">Recent online orders</h3>
            <button type="button" className={button} onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
          {!orders.length && <p className="text-sm">No orders displayed.</p>}
          <ul className="divide-y divide-admin-border">
            {orders.map((o) => (
              <li key={o.id} className="space-y-1 py-3 text-sm">
                <strong>
                  {o.quantity} × {o.product_name} · {formatCod(o.total)}
                </strong>
                <p>
                  {o.customer_name} · {o.phone}
                </p>
                <p>
                  {o.delivery_address} · {o.delivery_zone}
                </p>
                <p className="break-all text-xs">
                  {new Date(o.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })} ·{" "}
                  {o.id}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
