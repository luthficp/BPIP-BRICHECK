"use client";

import * as React from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Textarea yang tingginya mengikuti isi, tampil seperti input satu baris
 * sampai teksnya memanjang. Dipakai pada sel tabel agar isian panjang
 * (nama PT, nomor kontrak) tetap terbaca penuh dan mudah dibandingkan.
 */
const AutoTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, value, onChange, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    // Tinggi = isi + border (kotak border-box): tanpa itu dua piksel terakhir terpotong.
    const fit = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      const border = el.offsetHeight - el.clientHeight;
      el.style.height = `${el.scrollHeight + border}px`;
    }, []);

    React.useLayoutEffect(fit, [value, fit]);

    // Lebar berubah (layar diputar, jendela diubah) -> pembungkusan baris berubah -> ukur ulang.
    React.useEffect(() => {
      const el = innerRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      let lastWidth = el.clientWidth;
      const observer = new ResizeObserver(() => {
        if (el.clientWidth === lastWidth) return;
        lastWidth = el.clientWidth;
        fit();
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [fit]);

    return (
      <Textarea
        ref={setRefs}
        rows={1}
        value={value}
        onChange={onChange}
        className={cn("min-h-9 resize-none overflow-hidden py-2 leading-snug", className)}
        {...props}
      />
    );
  },
);
AutoTextarea.displayName = "AutoTextarea";

export { AutoTextarea };
