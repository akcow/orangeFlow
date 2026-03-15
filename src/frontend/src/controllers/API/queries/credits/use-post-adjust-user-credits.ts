import type { UseMutationResult } from "@tanstack/react-query";
import type { CreditAdjustPayload, CreditLedgerEntry, useMutationFunctionType } from "@/types/api";
import { api } from "../../api";
import { getURL } from "../../helpers/constants";
import { UseRequestProcessor } from "../../services/request-processor";

type Params = {
  userId: string;
  payload: CreditAdjustPayload;
};

export const usePostAdjustUserCredits: useMutationFunctionType<
  undefined,
  Params,
  CreditLedgerEntry
> = (options) => {
  const { mutate } = UseRequestProcessor();

  const adjustUserCredits = async ({ userId, payload }: Params): Promise<CreditLedgerEntry> => {
    const res = await api.post(`${getURL("CREDITS")}/admin/users/${userId}/adjust`, payload);
    return res.data;
  };

  const mutation: UseMutationResult = mutate(
    ["credits", "admin", "adjust"],
    adjustUserCredits,
    options,
  );

  return mutation;
};
