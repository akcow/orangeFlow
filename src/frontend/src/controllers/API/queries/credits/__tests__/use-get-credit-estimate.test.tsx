import { act, renderHook } from "@testing-library/react";
import { useGetCreditEstimateQuery } from "../use-get-credit-estimate";

const mockPost = jest.fn();
const mockQuery = jest.fn();
const mockAuthStore = jest.fn();

jest.mock("../../../api", () => ({
  api: {
    post: (...args) => mockPost(...args),
  },
}));

jest.mock("../../../helpers/constants", () => ({
  getURL: () => "/api/v1/credits",
}));

jest.mock("../../../services/request-processor", () => ({
  UseRequestProcessor: () => ({
    query: (...args) => mockQuery(...args),
    queryClient: {},
    mutate: jest.fn(),
  }),
}));

jest.mock("@/stores/authStore", () => ({
  __esModule: true,
  default: (...args) => mockAuthStore(...args),
}));

describe("useGetCreditEstimateQuery", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockQuery.mockReset();
    mockAuthStore.mockReset();

    mockPost.mockResolvedValue({ data: { billing_mode: "estimated", estimated_credits: 24 } });
    mockQuery.mockReturnValue({ data: null, isLoading: false, isFetching: false });
    mockAuthStore.mockImplementation((selector) => selector({ isAuthenticated: true }));
  });

  it("updates the query key and request payload immediately when the estimate payload changes", async () => {
    const firstPayload = {
      vertex_id: "node-1",
      node_payload: {
        id: "node-1",
        data: {
          id: "node-1",
          type: "DoubaoVideoGenerator",
          node: {
            template: {
              model_name: { value: "wan2.6" },
              resolution: { value: "720p" },
              duration: { value: 5 },
            },
          },
        },
      },
    };
    const secondPayload = {
      ...firstPayload,
      node_payload: {
        ...firstPayload.node_payload,
        data: {
          ...firstPayload.node_payload.data,
          node: {
            template: {
              model_name: { value: "wan2.6" },
              resolution: { value: "1080p" },
              duration: { value: 10 },
            },
          },
        },
      },
    };

    const { rerender } = renderHook(
      ({ payload }) => useGetCreditEstimateQuery(payload as any),
      { initialProps: { payload: firstPayload } },
    );

    const firstQueryFn = mockQuery.mock.calls[0][1];

    rerender({ payload: secondPayload });

    expect(mockQuery).toHaveBeenLastCalledWith(
      ["credits", "estimate", JSON.stringify(secondPayload)],
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );

    const secondQueryFn = mockQuery.mock.calls[1][1];

    await act(async () => {
      await firstQueryFn();
      await secondQueryFn();
    });

    expect(mockPost).toHaveBeenNthCalledWith(
      1,
      "/api/v1/credits/estimate",
      firstPayload,
    );
    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      "/api/v1/credits/estimate",
      secondPayload,
    );
  });
});
