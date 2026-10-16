/**
 * Logo BRI dari /public. "light" = berkas untuk tema terang, "dark" = untuk
 * tema gelap (ganti ekstensi di sini bila berkas Anda .png/.webp).
 */
const LOGO_LIGHT_SRC = "/bri-logo-light.svg";
const LOGO_DARK_SRC = "/bri-logo-dark.svg";

export function BriLogo({ heightClass = "h-8" }: { heightClass?: string }) {
  return (
    <span className={`flex shrink-0 items-center ${heightClass}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_LIGHT_SRC} alt="" className={`${heightClass} w-auto dark:hidden`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_DARK_SRC} alt="" className={`hidden ${heightClass} w-auto dark:block`} />
    </span>
  );
}
