import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVisitorCurrency } from "@/lib/geo.functions";
import { USD, type Currency } from "@/lib/currency";

export function useCurrency(): Currency {
  const fn = useServerFn(getVisitorCurrency);
  const { data } = useQuery({
    queryKey: ["visitor-currency"],
    queryFn: () => fn(),
    staleTime: 1000 * 60 * 60,
    retry: false,
  });
  return data?.currency ?? USD;
}
