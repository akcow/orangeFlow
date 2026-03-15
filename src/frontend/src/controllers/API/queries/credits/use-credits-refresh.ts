import { useEffect } from "react";
import { subscribeCreditsRefresh } from "@/utils/creditsEvents";

export function useCreditsRefresh(refetch: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    return subscribeCreditsRefresh(() => {
      refetch();
    });
  }, [enabled, refetch]);
}
