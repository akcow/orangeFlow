import { fireEvent, render, screen } from "@testing-library/react";
import { CreditsBalanceButton } from "../index";

const mockOpenCreditsCenter = jest.fn();

let mockCreditData: { balance: number } | undefined = { balance: 0 };
let mockIsLoading = false;

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      resolvedLanguage: "zh-CN",
    },
  }),
}));

jest.mock("@/components/CreditsCenterDialog", () => ({
  CreditsCenterDialog: () => null,
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

jest.mock("@/controllers/API/queries/credits", () => ({
  useGetMyCreditsQuery: () => ({
    data: mockCreditData,
    isLoading: mockIsLoading,
  }),
}));

jest.mock("@/stores/creditsCenterStore", () => ({
  __esModule: true,
  default: (selector) =>
    selector({
      openCreditsCenter: mockOpenCreditsCenter,
    }),
}));

jest.mock("@/utils/utils", () => ({
  __esModule: true,
  cn: (...args) => args.filter(Boolean).join(" "),
}));

describe("CreditsBalanceButton", () => {
  beforeEach(() => {
    mockOpenCreditsCenter.mockReset();
    mockCreditData = { balance: 0 };
    mockIsLoading = false;
  });

  it("shows the exact balance when it does not exceed 10000", () => {
    mockCreditData = { balance: 10_000 };

    render(<CreditsBalanceButton />);

    expect(screen.getByText("10,000")).toBeInTheDocument();
    expect(screen.queryByText("10K")).not.toBeInTheDocument();
  });

  it("shows a rough K balance when it exceeds 10000", () => {
    mockCreditData = { balance: 12_345 };

    render(<CreditsBalanceButton />);

    expect(screen.getByText("12K")).toBeInTheDocument();
  });

  it("opens the credits center when clicked", () => {
    mockCreditData = { balance: 12_345 };

    render(<CreditsBalanceButton />);

    fireEvent.click(screen.getByRole("button"));

    expect(mockOpenCreditsCenter).toHaveBeenCalledWith("topup");
  });
});
