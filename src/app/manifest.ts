import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME ?? "Nearswap";
  return {
    name,
    short_name: name,
    description: "Buy & sell with neighbours. Escrow-protected, no delivery.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#059669",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
