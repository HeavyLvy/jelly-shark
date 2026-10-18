"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_NAME } from "@/lib/brand";
import { accentVars, iconUrl, refreshBrand, useBrand } from "@/lib/brand-client";

/**
 * Applies the instance branding: the accent color, the favicon, and the name
 * in browser tab titles (pages set titles like "Settings · Jelly Shark").
 * Mounted once in the root layout; also fetches the latest branding on load.
 */
export function BrandApplier() {
  const { brand, custom, version } = useBrand();

  useEffect(() => {
    void refreshBrand();
  }, []);

  // Accent color
  useEffect(() => {
    const html = document.documentElement;
    for (const [k, v] of Object.entries(accentVars(brand.accent))) html.style.setProperty(k, v);
  }, [brand.accent]);

  // Favicon: custom icon when branded; the built-in one is restored on reset.
  useEffect(() => {
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    if (custom) {
      const href = iconUrl(version);
      if (links.length === 0) {
        const l = document.createElement("link");
        l.rel = "icon";
        l.href = href;
        document.head.append(l);
      }
      links.forEach((l) => {
        l.dataset.defaultHref ??= l.getAttribute("href") ?? "";
        l.dataset.defaultType ??= l.getAttribute("type") ?? "";
        l.href = href;
        l.removeAttribute("type");
      });
    } else {
      links.forEach((l) => {
        if (l.dataset.defaultHref === undefined) return;
        l.setAttribute("href", l.dataset.defaultHref);
        if (l.dataset.defaultType) l.setAttribute("type", l.dataset.defaultType);
      });
    }
  }, [custom, version]);

  // Tab title: pages set "Page · Jelly Shark"; show the custom name instead, and put the default back after a reset.
  const shownName = useRef(DEFAULT_NAME);
  useEffect(() => {
    const retitle = () => {
      let t = document.title;
      if (shownName.current !== DEFAULT_NAME && shownName.current !== brand.name) t = t.replaceAll(shownName.current, DEFAULT_NAME);
      if (brand.name !== DEFAULT_NAME) t = t.replaceAll(DEFAULT_NAME, brand.name);
      if (t !== document.title) document.title = t;
    };
    retitle();
    shownName.current = brand.name;
    if (brand.name === DEFAULT_NAME) return;
    const el = document.querySelector("title");
    const mo = new MutationObserver(retitle);
    mo.observe(el ?? document.head, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [brand.name]);

  return null;
}
