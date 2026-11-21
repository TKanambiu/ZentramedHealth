import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { getCategory } from "../data/catalogue";
import { reportLovableError } from "../lib/lovable-error-reporting";
const LOGO_PRELOAD_URL = "/logo-wide.png";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "Zentramed Health" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preload", as: "image", href: LOGO_PRELOAD_URL, fetchPriority: "high" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <MetricoolPageViews />
    </QueryClientProvider>
  );
}

type MetricoolTracker = { t: (options: { hash: string }) => void };
const metricoolHash = "addf46679badf048ff38861ca9584b2d";
let metricoolScript: Promise<MetricoolTracker | undefined> | undefined;
let lastMetricoolPath: string | undefined;

function isMeasuredPath(pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/";
  if (["/", "/about", "/services", "/products", "/featured-products"].includes(path)) return true;
  const category = /^\/products\/([a-z-]+)$/.exec(path);
  return !!(category && getCategory(category[1]));
}

function loadMetricool() {
  const browser = window as Window & { beTracker?: MetricoolTracker };
  if (browser.beTracker) return Promise.resolve(browser.beTracker);
  if (!metricoolScript) {
    metricoolScript = new Promise<MetricoolTracker | undefined>((resolve) => {
      const script = document.createElement("script");
      script.src = "https://tracker.metricool.com/resources/be.js";
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.addEventListener("load", () => resolve(browser.beTracker), { once: true });
      script.addEventListener("error", () => {
        script.remove();
        resolve(undefined);
      }, { once: true });
      document.head.appendChild(script);
    }).then((tracker) => {
      if (!tracker) metricoolScript = undefined;
      return tracker;
    });
  }
  return metricoolScript;
}

function MetricoolPageViews() {
  const href = useLocation({ select: (location) => location.href });

  useEffect(() => {
    const url = new URL(window.location.href);
    // The vendor tag reads the full URL and referrer. Don't send query strings,
    // fragments, staff-console URLs, or the contact form to analytics.
    const ref = document.referrer ? new URL(document.referrer) : undefined;
    if (!isMeasuredPath(url.pathname) || url.search || url.hash || ref?.search || ref?.hash ||
        (ref?.origin === url.origin && !isMeasuredPath(ref.pathname))) {
      lastMetricoolPath = undefined;
      return;
    }
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (lastMetricoolPath === path) return;
    let cancelled = false;
    void loadMetricool().then((tracker) => {
      if (!tracker || cancelled || window.location.href !== url.href || lastMetricoolPath === path) return;
      tracker.t({ hash: metricoolHash });
      lastMetricoolPath = path;
    }).catch(() => { /* Analytics must not interrupt the storefront. */ });
    return () => { cancelled = true; };
  }, [href]);

  return null;
}
