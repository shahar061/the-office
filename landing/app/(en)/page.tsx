import { LandingPage } from "@/components/LandingPage";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function EnglishHome() {
  const dict = await getDictionary("en");
  return <LandingPage locale="en" dict={dict} />;
}
