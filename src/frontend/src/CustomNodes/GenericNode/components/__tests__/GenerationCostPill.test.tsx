import { render, screen } from "@testing-library/react";
import GenerationCostPill from "../GenerationCostPill";

const mockUseGetCreditEstimateQuery = jest.fn();

jest.mock("lucide-react", () => ({
  CircleDollarSign: (props) => <svg data-testid="credits-icon" {...props} />,
}));

jest.mock("@/controllers/API/queries/credits", () => ({
  useGetCreditEstimateQuery: (...args) => mockUseGetCreditEstimateQuery(...args),
}));

jest.mock("@/utils/utils", () => ({
  __esModule: true,
  cn: (...args) => args.filter(Boolean).join(" "),
}));

describe("GenerationCostPill", () => {
  beforeEach(() => {
    mockUseGetCreditEstimateQuery.mockReset();
    mockUseGetCreditEstimateQuery.mockImplementation((payload) => ({
      data: {
        billing_mode: "estimated",
        estimated_credits:
          payload?.node_payload?.data?.node?.template?.model_name?.value === "Model B" ? 24 : 12,
      },
      isLoading: false,
      isFetching: false,
    }));
  });

  it("rebuilds the estimate payload when a nested billing field changes on the same template object", () => {
    const sharedTemplate = {
      model_name: { value: "Model A", default: "Model A" },
      resolution: { value: "1024x1024" },
      image_count: { value: 1 },
    };

    const baseData: any = {
      id: "node-1",
      type: "DoubaoImageCreator",
      node: {
        template: sharedTemplate,
      },
    };

    const { rerender } = render(
      <GenerationCostPill data={baseData}>
        <button type="button">Run</button>
      </GenerationCostPill>,
    );

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(mockUseGetCreditEstimateQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        node_payload: expect.objectContaining({
          data: expect.objectContaining({
            node: expect.objectContaining({
              template: expect.objectContaining({
                model_name: expect.objectContaining({ value: "Model A" }),
              }),
            }),
          }),
        }),
      }),
      expect.any(Object),
    );

    sharedTemplate.model_name.value = "Model B";

    rerender(
      <GenerationCostPill
        data={{
          ...baseData,
          node: {
            ...baseData.node,
            template: sharedTemplate,
          },
        }}
      >
        <button type="button">Run</button>
      </GenerationCostPill>,
    );

    expect(screen.getByText("24")).toBeInTheDocument();
    expect(mockUseGetCreditEstimateQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        node_payload: expect.objectContaining({
          data: expect.objectContaining({
            node: expect.objectContaining({
              template: expect.objectContaining({
                model_name: expect.objectContaining({ value: "Model B" }),
              }),
            }),
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it("keeps the previous estimate visible during refetch to avoid flicker", () => {
    mockUseGetCreditEstimateQuery
      .mockReturnValueOnce({
        data: {
          billing_mode: "estimated",
          estimated_credits: 12,
        },
        isLoading: false,
        isFetching: false,
      })
      .mockReturnValueOnce({
        data: {
          billing_mode: "estimated",
          estimated_credits: 12,
        },
        isLoading: false,
        isFetching: true,
      });

    const data = {
      id: "node-1",
      type: "DoubaoImageCreator",
      node: {
        template: {
          model_name: { value: "Model A" },
          resolution: { value: "1024x1024" },
          image_count: { value: 1 },
        },
      },
    } as any;

    const { rerender } = render(
      <GenerationCostPill
        data={data}
      >
        <button type="button">Run</button>
      </GenerationCostPill>,
    );

    expect(screen.getByText("12")).toBeInTheDocument();

    rerender(
      <GenerationCostPill
        data={data}
      >
        <button type="button">Run</button>
      </GenerationCostPill>,
    );

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText("估算中...")).not.toBeInTheDocument();
  });

  it("shows a loading label only before the first estimate arrives", () => {
    mockUseGetCreditEstimateQuery.mockReturnValue({
      data: null,
      isLoading: true,
      isFetching: false,
    });

    render(
      <GenerationCostPill
        data={{
          id: "node-1",
          type: "DoubaoImageCreator",
          node: {
            template: {
              model_name: { value: "Model A" },
              resolution: { value: "1024x1024" },
              image_count: { value: 1 },
            },
          },
        } as any}
      >
        <button type="button">Run</button>
      </GenerationCostPill>,
    );

    expect(screen.getByText("估算中...")).toBeInTheDocument();
  });
});
