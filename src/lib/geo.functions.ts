import { createServerFn } from "@tanstack/react-start";
import { detectCurrency } from "./geo.server";

export const getVisitorCurrency = createServerFn({ method: "GET" }).handler(async () => {
  return { currency: await detectCurrency() };
});
