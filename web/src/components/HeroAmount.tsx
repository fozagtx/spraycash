import { CURRENCIES, type CurrencyCode } from "@/lib/currencies";

/** The big ticking number: whole units in ink, decimals muted so the movement reads at a glance. */
export function HeroAmount({ amount, code }: { amount: number; code: CurrencyCode }) {
  const parts = new Intl.NumberFormat(CURRENCIES[code].locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(amount);
  let whole = "";
  let cents = "";
  let afterDecimal = false;
  for (const p of parts) {
    if (p.type === "decimal") afterDecimal = true;
    if (afterDecimal) cents += p.value;
    else whole += p.value;
  }
  return (
    <div className="money hero-number" aria-live="off">
      {whole}
      <span className="cents">{cents}</span>
    </div>
  );
}
