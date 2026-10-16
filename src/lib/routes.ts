/** Rute utama aplikasi. Dipakai bersama oleh header, Home, dan tombol kembali agar tidak tersebar. */
export const ROUTE_HOME = "/";
export const ROUTE_TASKS = "/tasks";
export const ROUTE_FAQ = "/faq";

export const checklistRoute = (id: string): string => `/checklist/${id}`;
