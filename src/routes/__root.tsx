import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { type ReactNode } from "react";
import appCss from "../styles.css?url";
import { AuthProvider } from "../lib/auth-context";
import { Toaster } from "../components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Araa Honey — Manajemen Bisnis" },
      { name: "description", content: "Sistem manajemen operasional terintegrasi Araa Honey" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { 
        rel: "icon", 
        type: "image/png", 
        href: "https://saefgyiloalpiqfrglqo.supabase.co/storage/v1/object/public/avatars/b2ef75dc-8ebc-43e5-84fb-ca8998b9f96f/avatar.png" 
      }
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head><HeadContent /></head>
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
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
