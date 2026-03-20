import { fireEvent, render, screen } from "@testing-library/react";
import { TapNowHeader } from "../index";

const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockSetNotificationCenter = jest.fn();

let mockUserData = {
  nickname: "Tester",
  username: "tester",
  profile_image: "",
  is_superuser: false,
  is_reviewer: false,
};

jest.mock("react-router-dom", () => ({
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
  useLocation: () => ({ pathname: "/home" }),
  useNavigate: () => mockNavigate,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      resolvedLanguage: "en",
      changeLanguage: jest.fn(),
    },
  }),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

jest.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }) => <div {...props}>{children}</div>,
  AvatarFallback: ({ children, ...props }) => <div {...props}>{children}</div>,
  AvatarImage: (props) => <img alt="" {...props} />,
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }) => <>{children}</>,
  DropdownMenuContent: ({ children, sideOffset, ...props }) => (
    <div {...props}>{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick, ...props }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: (props) => <div {...props} />,
}));

jest.mock("@/components/core/appHeaderComponent/components/TeamMenu", () => ({
  __esModule: true,
  default: () => <div data-testid="team-menu" />,
}));

jest.mock("@/components/core/flowToolbarComponent/components/deploy-dropdown", () => ({
  __esModule: true,
  default: () => <div data-testid="publish-dropdown" />,
}));

jest.mock("@/components/common/genericIconComponent", () => ({
  __esModule: true,
  default: ({ name, className }) => <span data-testid={`icon-${name}`} className={className} />,
}));

jest.mock("../NotificationPanel", () => ({
  __esModule: true,
  NotificationPanel: ({ open, title }) =>
    open ? <div data-testid="notification-panel">{title}</div> : null,
}));

jest.mock("@/stores/authStore", () => ({
  __esModule: true,
  default: () => ({
    userData: mockUserData,
    isAuthenticated: true,
    logout: mockLogout,
  }),
}));

jest.mock("@/stores/alertStore", () => ({
  __esModule: true,
  default: (selector) =>
    selector({
      notificationCenter: true,
      setNotificationCenter: mockSetNotificationCenter,
    }),
}));

jest.mock("@/controllers/API/queries/notifications", () => ({
  __esModule: true,
  useGetMyNotificationsQuery: () => ({
    data: [],
  }),
}));

jest.mock("@/stores/flowStore", () => ({
  __esModule: true,
  default: (selector) =>
    selector({
      onFlowPage: false,
    }),
}));

jest.mock("@/utils/utils", () => ({
  __esModule: true,
  cn: (...args) => args.filter(Boolean).join(" "),
}));

describe("TapNowHeader notifications", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockLogout.mockReset();
    mockSetNotificationCenter.mockReset();
    mockUserData = {
      nickname: "Tester",
      username: "tester",
      profile_image: "",
      is_superuser: false,
      is_reviewer: false,
    };
  });

  it("opens the notification panel from the avatar menu item", () => {
    render(<TapNowHeader />);

    fireEvent.click(screen.getByTestId("avatar-notification-menu-item"));

    expect(mockSetNotificationCenter).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("notification-panel")).toHaveTextContent(
      "Notifications",
    );
  });

  it("shows the moderation entry for reviewers and navigates to the moderation page", () => {
    mockUserData = {
      ...mockUserData,
      is_reviewer: true,
    };

    render(<TapNowHeader />);

    fireEvent.click(screen.getByTestId("avatar-moderation-menu-item"));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/community");
  });

  it("shows the credit management entry for superusers and navigates to credit management", () => {
    mockUserData = {
      ...mockUserData,
      is_superuser: true,
    };

    render(<TapNowHeader />);

    fireEvent.click(screen.getByTestId("avatar-credit-management-menu-item"));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/credits");
  });

  it("hides the moderation entry for regular users", () => {
    render(<TapNowHeader />);

    expect(
      screen.queryByTestId("avatar-moderation-menu-item"),
    ).not.toBeInTheDocument();
  });

  it("hides the credit management entry for regular users", () => {
    render(<TapNowHeader />);

    expect(
      screen.queryByTestId("avatar-credit-management-menu-item"),
    ).not.toBeInTheDocument();
  });
});
