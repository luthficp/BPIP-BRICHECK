import type { Metadata } from "next";

import { FaqView } from "@/components/faq/faq-view";
import { APP_NAME } from "@/lib/checklist/config";

export const metadata: Metadata = {
  title: `FAQ - ${APP_NAME}`,
  description: "Panduan penggunaan dan istilah pada BRICHECK — BRI Checklist & Validation.",
};

export default function FaqPage() {
  return <FaqView />;
}
