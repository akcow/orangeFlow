import { fireEvent, render, screen } from "@testing-library/react";
import AdminCreditsPage from "../CreditsPage";

const mockNavigate = jest.fn();
const mockSetSuccessData = jest.fn();
const mockSetErrorData = jest.fn();
const mockRefetchUsers = jest.fn().mockResolvedValue(undefined);
const mockRefetchLedger = jest.fn().mockResolvedValue(undefined);
const mockMutateAdjustUserCredits = jest.fn();
const mockDispatchCreditsRefreshEvent = jest.fn();

const adminUsersPage = {
  total_count: 2,
  users: [
    {
      id: "user-1",
      username: "alice",
      nickname: "Alice",
      is_active: true,
      is_superuser: false,
      is_reviewer: false,
      profile_image: "",
      credit_balance: 120,
      credit_total_recharged: 300,
      credit_total_consumed: 180,
      create_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "user-2",
      username: "bob",
      nickname: "Bob",
      is_active: true,
      is_superuser: false,
      is_reviewer: false,
      profile_image: "",
      credit_balance: 40,
      credit_total_recharged: 90,
      credit_total_consumed: 50,
      create_at: new Date(),
      updated_at: new Date(),
    },
  ],
};

const creditLedger = [
  {
    id: "ledger-1",
    delta: 30,
    balance_after: 120,
    entry_type: "MANUAL_ADJUSTMENT" as const,
    remark: "Campaign bonus",
    created_at: "2026-03-20T10:00:00Z",
  },
];

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      resolvedLanguage: "en",
    },
  }),
}));

jest.mock("@/components/common/paginatorComponent", () => ({
  __esModule: true,
  default: () => <div data-testid="credits-paginator" />,
}));

jest.mock("@/customization/components/custom-loader", () => ({
  __esModule: true,
  default: () => <div data-testid="credits-loader" />,
}));

jest.mock("@/controllers/API/queries/credits", () => ({
  __esModule: true,
  useGetAdminCreditUsersQuery: () => ({
    data: adminUsersPage,
    isLoading: false,
    refetch: mockRefetchUsers,
  }),
  useGetAdminUserCreditLedgerQuery: ({ userId }: { userId: string }) => ({
    data: userId ? creditLedger : [],
    isLoading: false,
    refetch: mockRefetchLedger,
  }),
  usePostAdjustUserCredits: () => ({
    mutate: mockMutateAdjustUserCredits,
    isPending: false,
  }),
}));

jest.mock("@/stores/alertStore", () => ({
  __esModule: true,
  default: (selector: any) =>
    selector({
      setSuccessData: mockSetSuccessData,
      setErrorData: mockSetErrorData,
    }),
}));

jest.mock("@/utils/creditsEvents", () => ({
  __esModule: true,
  dispatchCreditsRefreshEvent: () => mockDispatchCreditsRefreshEvent(),
}));

describe("AdminCreditsPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSetSuccessData.mockReset();
    mockSetErrorData.mockReset();
    mockRefetchUsers.mockClear();
    mockRefetchLedger.mockClear();
    mockMutateAdjustUserCredits.mockReset();
    mockDispatchCreditsRefreshEvent.mockReset();
  });

  it("navigates back to admin page", () => {
    render(<AdminCreditsPage />);

    fireEvent.click(screen.getByText("Back To Admin"));

    expect(mockNavigate).toHaveBeenCalledWith("/admin");
  });

  it("selects a user and submits a credit adjustment", () => {
    render(<AdminCreditsPage />);

    fireEvent.click(screen.getByTestId("admin-credits-user-item-user-2"));
    fireEvent.change(screen.getByTestId("admin-credits-amount-input"), {
      target: { value: "88" },
    });
    fireEvent.change(screen.getByTestId("admin-credits-remark-input"), {
      target: { value: "Manual reward" },
    });
    fireEvent.click(screen.getByTestId("admin-credits-submit-button"));

    expect(mockMutateAdjustUserCredits).toHaveBeenCalledWith(
      {
        userId: "user-2",
        payload: {
          amount: 88,
          remark: "Manual reward",
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("shows validation error when amount is zero", () => {
    render(<AdminCreditsPage />);

    fireEvent.change(screen.getByTestId("admin-credits-amount-input"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByTestId("admin-credits-remark-input"), {
      target: { value: "Still invalid" },
    });
    fireEvent.click(screen.getByTestId("admin-credits-submit-button"));

    expect(mockSetErrorData).toHaveBeenCalledWith({
      title: "Enter a non-zero credit adjustment",
    });
    expect(mockMutateAdjustUserCredits).not.toHaveBeenCalled();
  });
});
