import {
  type QueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  MutationFunctionType,
  QueryFunctionType,
} from "../../../types/api";

export function UseRequestProcessor(): {
  query: QueryFunctionType;
  mutate: MutationFunctionType;
  queryClient: QueryClient;
} {
  const queryClient = useQueryClient();

  function query(
    queryKey: UseQueryOptions<any, any, any, any>["queryKey"],
    queryFn: UseQueryOptions<any, any, any, any>["queryFn"],
    options: Omit<UseQueryOptions<any, any, any, any>, "queryFn" | "queryKey"> = {},
  ) {
    return useQuery({
      queryKey,
      queryFn,
      retry: 5,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      ...options,
    });
  }

  function mutate(
    mutationKey: UseMutationOptions<any, any, any, any>["mutationKey"],
    mutationFn: UseMutationOptions<any, any, any, any>["mutationFn"],
    options: Omit<
      UseMutationOptions<any, any, any, any>,
      "mutationFn" | "mutationKey"
    > = {},
  ) {
    return useMutation({
      mutationKey,
      mutationFn,
      onSettled: (data, error, variables, context) => {
        queryClient.invalidateQueries({ queryKey: mutationKey });
        options.onSettled && options.onSettled(data, error, variables, context);
      },
      ...options,
      retry: options.retry ?? 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });
  }

  return { query, mutate, queryClient };
}
