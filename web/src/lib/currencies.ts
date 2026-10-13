import { hexToString, stringToHex, trim, type Hex } from "viem";

export type CurrencyCode = "INR" | "MXN" | "PHP" | "NGN";

export type Currency = {
  code: CurrencyCode;
  country: string;
  locale: string;
  symbol: string;
  /** CSS background for the round flag chip. */
  flag: string;
};

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  INR: {
    code: "INR",
    country: "India",
    locale: "en-IN",
    symbol: "₹",
    flag: "linear-gradient(#FF9933 0 33%, #FFFFFF 33% 66%, #138808 66%)",
  },
  MXN: {
    code: "MXN",
    country: "Mexico",
    locale: "es-MX",
    symbol: "$",
    flag: "linear-gradient(90deg, #006847 0 33%, #FFFFFF 33% 66%, #CE1126 66%)",
  },
  PHP: {
    code: "PHP",
    country: "Philippines",
    locale: "en-PH",
    symbol: "₱",
    flag: "linear-gradient(#0038A8 0 50%, #CE1126 50%)",
  },
  NGN: {
    code: "NGN",
    country: "Nigeria",
    locale: "en-NG",
    symbol: "₦",
    flag: "linear-gradient(90deg, #008751 0 33%, #FFFFFF 33% 66%, #008751 66%)",
  },
};

export const CURRENCY_LIST = Object.values(CURRENCIES);

export const currencyKey = (code: string): Hex => stringToHex(code, { size: 32 });

export function currencyFromKey(key: Hex): Currency | undefined {
  const code = hexToString(trim(key, { dir: "right" }));
  return CURRENCIES[code as CurrencyCode];
}
