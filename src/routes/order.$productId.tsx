import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { SiteHeader } from "@/components/site-chrome";
import { OptimizedImage } from "@/components/optimized-image";
import { WhatsAppFloat } from "@/components/whatsapp-float";
import { whatsappLink } from "@/lib/whatsapp";
import {
  codQueryKey,
  fetchCodCatalogue,
  placeCodOrder,
  codTotal,
  formatCod,
  type Receipt,
} from "@/lib/cod";

export const Route = createFileRoute("/order/$productId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cash on delivery | Zentramed Health" },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: CheckoutPage,
});

const textField =
  "mt-1.5 block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground";
const errors: Record<string, string> = {
  invalid_details: "Check your contact details, delivery address and quantity.",
  stock_changed: "There isn’t enough stock for that quantity. Review the available quantity.",
  price_changed: "The price changed. Review the updated total before placing the order.",
  delivery_changed: "That delivery option changed. Choose an available destination.",
  try_later: "We’ve received several orders for this phone number. Please contact us on WhatsApp.",
  request_mismatch:
    "A previous attempt used different details. Contact us on WhatsApp before ordering again.",
};

function CheckoutPage() {
  const { productId } = Route.useParams();
  const q = useQuery({ queryKey: codQueryKey, queryFn: fetchCodCatalogue, retry: false });
  const product = q.data?.items.find(({ id }) => id === productId);
  const [chosen, setChosen] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt>();
  const [retryLocked, setRetryLocked] = useState(false);
  const attempt = useRef<{ key: string; id: string } | undefined>(undefined);
  const submitting = useRef(false);
  const zone = q.data?.zones.find(({ id }) => id === chosen);
  const total = product && zone ? codTotal(product.price, quantity, zone.fee) : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || !zone || total === undefined || submitting.current) return;
    const f = new FormData(event.currentTarget);
    const input = {
      p_product: product.id,
      p_zone: zone.id,
      p_quantity: quantity,
      p_total: total,
      p_name: String(f.get("name") ?? "").trim(),
      p_phone: String(f.get("phone") ?? "").trim(),
      p_address: String(f.get("address") ?? "").trim(),
    };
    const key = JSON.stringify(input);
    if (retryLocked && attempt.current?.key !== key) {
      setError(
        "Order confirmation is still uncertain. Please contact us before placing another order.",
      );
      return;
    }
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await placeCodOrder({ ...input, p_request: attempt.current.id });
      setRetryLocked(false);
      if ("error" in response) {
        setError(errors[response.error] ?? "Order not placed. Please review the details.");
        if (["stock_changed", "price_changed", "delivery_changed"].includes(response.error))
          await q.refetch();
      } else setReceipt(response);
    } catch {
      setRetryLocked(true);
      setError(
        "Order confirmation was not received. Retry without changing the details to avoid a duplicate.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10 md:px-6">
        <a
          href={`/item/${encodeURIComponent(productId)}`}
          className="text-sm font-semibold text-brand underline"
        >
          Back to product
        </a>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Zentramed Health
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-brand md:text-4xl">
            Cash on delivery
          </h1>
          <p className="mt-2 text-muted-foreground">
            Order here and pay when your order arrives. No online payment is taken.
          </p>
        </div>
        {receipt ? (
          <section aria-live="polite" className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-brand">Order received</h2>
            <p className="mt-3 break-all text-sm">
              Order reference: <strong>{receipt.reference}</strong>
            </p>
            <p className="mt-2">
              Pay on delivery: <strong>{formatCod(receipt.total)}</strong>
            </p>
            <p>
              Estimated delivery: <strong>{receipt.window}</strong>
            </p>
          </section>
        ) : q.isPending ? (
          <p role="status">Checking current price and availability…</p>
        ) : !product || product.available < 1 || !q.data?.zones.length ? (
          <section className="rounded-2xl border bg-card p-6">
            <p>Online checkout isn’t available for this product right now.</p>
            <a
              className="mt-3 inline-block font-semibold text-brand underline"
              href={whatsappLink("Hello Zentramed Health, I have a product enquiry.")}
            >
              Enquire on WhatsApp
            </a>
          </section>
        ) : (
          <form onSubmit={submit} className="grid gap-6 md:grid-cols-[1.25fr_1fr]">
            <fieldset
              className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm"
              disabled={busy}
            >
              <legend className="px-2 text-lg font-semibold text-brand">Delivery details</legend>
              <label className="block text-sm font-medium">
                Full name
                <input
                  name="name"
                  className={textField}
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  readOnly={retryLocked}
                />
              </label>
              <label className="block text-sm font-medium">
                Kenyan mobile number
                <input
                  name="phone"
                  className={textField}
                  required
                  maxLength={18}
                  type="tel"
                  autoComplete="tel"
                  placeholder="07xx xxx xxx"
                  readOnly={retryLocked}
                />
              </label>
              <label className="block text-sm font-medium">
                Delivery zone
                <select
                  className={textField}
                  value={chosen}
                  required
                  onChange={(e) => {
                    if (!retryLocked) setChosen(e.target.value);
                  }}
                >
                  <option value="">Choose your delivery zone</option>
                  {q.data.zones.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label} ({formatCod(d.fee)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Delivery address
                <textarea
                  name="address"
                  className={textField}
                  required
                  minLength={8}
                  maxLength={350}
                  autoComplete="street-address"
                  placeholder="County or town, area, street and building"
                  readOnly={retryLocked}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                We use your contact and address to process and deliver this order.
              </p>
            </fieldset>
            <section className="space-y-4 self-start rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-brand">Order summary</h2>
              <div className="flex items-center gap-3">
                {product.image && (
                  <OptimizedImage
                    src={product.image}
                    alt=""
                    className="size-16 rounded-lg object-contain"
                  />
                )}
                <p className="font-semibold">
                  {product.name}
                  <span className="block text-sm font-normal">
                    {formatCod(product.price)} per listed unit
                  </span>
                </p>
              </div>
              <label className="block text-sm font-medium">
                Quantity
                <input
                  className={textField}
                  type="number"
                  required
                  min={1}
                  max={product.available}
                  value={Number.isFinite(quantity) ? quantity : ""}
                  readOnly={retryLocked || busy}
                  onChange={(e) => setQuantity(e.target.valueAsNumber)}
                />
              </label>
              <dl className="space-y-2 border-t pt-4">
                <div className="flex justify-between gap-2">
                  <dt>Delivery</dt>
                  <dd>{zone ? formatCod(zone.fee) : "Select a zone"}</dd>
                </div>
                {zone && (
                  <div className="flex justify-between gap-2">
                    <dt>Estimated delivery</dt>
                    <dd>{zone.window}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2 text-lg font-semibold">
                  <dt>Total on delivery</dt>
                  <dd>{Number.isFinite(total) ? formatCod(total!) : "—"}</dd>
                </div>
              </dl>
              {error && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
                  {error}
                </p>
              )}
              <button
                className="w-full rounded-lg bg-brand px-4 py-3 font-semibold text-brand-foreground disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={
                  busy ||
                  !zone ||
                  !Number.isInteger(quantity) ||
                  quantity < 1 ||
                  (!retryLocked && quantity > product.available)
                }
              >
                {busy
                  ? "Placing order…"
                  : retryLocked
                    ? "Retry order confirmation"
                    : "Place cash-on-delivery order"}
              </button>
              <a
                className="block text-center text-sm font-semibold text-brand underline"
                href={whatsappLink(
                  `Hello Zentramed Health, I have a question about ${product.name}.`,
                )}
              >
                Enquire on WhatsApp
              </a>
            </section>
          </form>
        )}
      </main>
      <WhatsAppFloat />
    </>
  );
}
