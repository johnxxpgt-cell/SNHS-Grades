import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

const appUrl = getSiteUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${appUrl}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${appUrl}/contact`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${appUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${appUrl}/terms`, changeFrequency: "yearly", priority: 0.3 }
  ];
}
