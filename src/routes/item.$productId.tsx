import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { OptimizedImage } from "@/components/optimized-image";
import { WhatsAppFloat } from "@/components/whatsapp-float";
import { codQueryKey, fetchCodCatalogue, formatCod } from "@/lib/cod";
import { whatsappLink } from "@/lib/whatsapp";

export const Route = createFileRoute("/item/$productId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Product details | Zentramed Health" }] }),
  component: ProductPage,
});

function ProductPage() {
  const { productId } = Route.useParams();
  const q = useQuery({
    queryKey: codQueryKey,
    queryFn: fetchCodCatalogue,
    retry: false,
    staleTime: 30_000,
  });
  const p = q.data?.items.find(({ id }) => id === productId);
  const saleReady = !!(p?.available && q.data?.zones.length);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[50vh] max-w-5xl space-y-6 px-4 py-10 md:px-6">
        <Link to="/products" className="text-sm font-semibold text-brand underline">
          Back to catalogue
        </Link>
        {q.isPending ? (
          <p role="status">Loading product…</p>
        ) : !p ? (
          <h1 className="text-2xl font-semibold">Product details unavailable</h1>
        ) : (
          <article className="grid gap-7 rounded-2xl border bg-card p-6 shadow-sm md:grid-cols-2">
            {p.image && (
              <OptimizedImage
                src={p.image}
                alt={p.name}
                className="aspect-square w-full rounded-xl object-contain"
              />
            )}
            <div className="space-y-4 self-center">
              <h1 className="font-display text-3xl font-bold text-brand">{p.name}</h1>
              <p className="whitespace-pre-line">{p.description}</p>
              <p className="text-xl font-bold">{formatCod(p.price)}</p>
              <p className={saleReady ? "font-medium text-emerald-800" : "text-muted-foreground"}>
                {saleReady
                  ? "In stock for online ordering"
                  : "Not currently available for online ordering"}
              </p>
              {saleReady && (
                <div>
                  <p className="mb-3 text-sm">
                    Cash on delivery. Choose a delivery zone at checkout to see the exact fee and
                    estimated arrival.
                  </p>
                  <a
                    href={`/order/${encodeURIComponent(productId)}`}
                    className="inline-flex rounded-lg bg-brand px-4 py-3 font-semibold text-brand-foreground"
                  >
                    Buy with cash on delivery
                  </a>
                </div>
              )}
              <a
                className="block font-semibold text-brand underline"
                href={whatsappLink(`Hello Zentramed Health, I have a question about ${p.name}.`)}
              >
                Enquire on WhatsApp
              </a>
              <p className="text-sm text-muted-foreground">
                Zentramed Health · Bazaar Plaza, 9th Floor, Suite A901, Nairobi
              </p>
            </div>
          </article>
        )}
      </main>
      <SiteFooter />
      <WhatsAppFloat />
    </>
  );
}
