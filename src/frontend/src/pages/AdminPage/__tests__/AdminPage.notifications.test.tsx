import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import AdminPage from "../index";
import { AuthContext } from "@/contexts/authContext";

const mockNavigate = jest.fn();
const mockSetSuccessData = jest.fn();
const mockSetErrorData = jest.fn();
const mockCreateAdminNotification = jest.fn();
const mockGetUsersMutate = jest.fn();
const mockGetSelectableUsersMutate = jest.fn();
let getUsersHookCall = 0;

const selectableUsers = [
  {
    id: "user-1",
    username: "alice",
    nickname: "Alice",
    is_active: true,
    is_superuser: false,
    is_reviewer: false,
    profile_image: "",
    create_at: new Date("2026-03-01T00:00:00Z"),
    updated_at: new Date("2026-03-01T00:00:00Z"),
  },
];

const notificationHistory = [
  {
    id: "notice-1",
    title: "系统维护通知",
    content: "今晚 22:00 开始维护，请提前保存内容。",
    link: "https://example.com/maintenance",
    target_type: "ALL",
    created_at: "2026-03-15T02:00:00Z",
    expires_at: "2026-03-22T02:00:00Z",
    created_by_name: "Root",
    recipient_count: 20,
    read_count: 12,
    hidden_count: 1,
  },
  {
    id: "notice-2",
    title: "奖励规则更新",
    content: "奖励发放规则将于下周一生效。",
    link: null,
    target_type: "USERS",
    created_at: "2026-03-14T02:00:00Z",
    expires_at: "2026-03-21T02:00:00Z",
    created_by_name: "Root",
    recipient_count: 2,
    read_count: 1,
    hidden_count: 0,
  },
];

const teamOptions = [
  {
    id: "team-1",
    name: "运营组",
    member_count: 3,
  },
];

jest.mock("@/customization/hooks/use-custom-navigate", () => ({
  __esModule: true,
  useCustomNavigate: () => mockNavigate,
}));

jest.mock("@/stores/alertStore", () => ({
  __esModule: true,
  default: (selector) =>
    selector({
      setSuccessData: mockSetSuccessData,
      setErrorData: mockSetErrorData,
    }),
}));

jest.mock("@/controllers/API/queries/notifications", () => ({
  __esModule: true,
  useCreateAdminNotification: () => ({
    mutate: mockCreateAdminNotification,
    isPending: false,
  }),
  useGetAdminNotificationsQuery: () => ({
    data: notificationHistory,
    isLoading: false,
  }),
}));

jest.mock("@/controllers/API/queries/teams", () => ({
  __esModule: true,
  useGetTeamsQuery: () => ({
    data: teamOptions,
    isLoading: false,
  }),
}));

jest.mock("@/controllers/API/queries/auth", () => ({
  __esModule: true,
  useDeleteUsers: () => ({ mutate: jest.fn() }),
  useUpdateUser: () => ({ mutate: jest.fn() }),
  useAddUser: () => ({ mutate: jest.fn() }),
  useGetUsers: jest.fn(() => {
    getUsersHookCall += 1;
    return getUsersHookCall % 2 === 1
      ? {
          mutate: mockGetUsersMutate,
          isPending: false,
          isIdle: false,
        }
      : {
          mutate: mockGetSelectableUsersMutate,
          isPending: false,
          isIdle: false,
        };
  }),
}));

jest.mock("@/i18n/t", () => ({
  __esModule: true,
  t: (value: string) => value,
}));

jest.mock("@/contexts/authContext", () => {
  const React = require("react");
  return {
    __esModule: true,
    AuthContext: React.createContext({ userData: null }),
  };
});

jest.mock("@/components/common/paginatorComponent", () => ({
  __esModule: true,
  default: () => <div data-testid="paginator" />,
}));

jest.mock("@/customization/components/custom-loader", () => ({
  __esModule: true,
  default: () => <div data-testid="loader" />,
}));

jest.mock("@/components/common/genericIconComponent", () => ({
  __esModule: true,
  default: ({ name }) => <span>{name}</span>,
}));

jest.mock("@/components/common/shadTooltipComponent", () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));

jest.mock("@/components/ui/button", () => ({
  __esModule: true,
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

jest.mock("@/components/ui/input", () => ({
  __esModule: true,
  Input: (props) => <input {...props} />,
}));

jest.mock("@/components/ui/textarea", () => ({
  __esModule: true,
  Textarea: (props) => <textarea {...props} />,
}));

jest.mock("@/components/ui/label", () => ({
  __esModule: true,
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

jest.mock("@/components/ui/card", () => ({
  __esModule: true,
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

jest.mock("@/components/ui/badge", () => ({
  __esModule: true,
  Badge: ({ children, ...props }) => <span {...props}>{children}</span>,
}));

jest.mock("@/components/ui/checkbox", () => ({
  __esModule: true,
  Checkbox: ({ checked, onCheckedChange, ...props }) => (
    <input
      type="checkbox"
      checked={!!checked}
      onChange={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
  CheckBoxDiv: ({ checked }) => <input type="checkbox" checked={checked} readOnly />,
}));

jest.mock("@/components/ui/select", () => {
  const React = require("react");
  const SelectContext = React.createContext({
    value: "",
    onValueChange: (_value: string) => {},
  });

  return {
    __esModule: true,
    Select: ({ value, onValueChange, children }) => (
      <SelectContext.Provider value={{ value, onValueChange }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children, ...props }) => <div {...props}>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }) => <div>{children}</div>,
    SelectItem: ({ value, children }) => {
      const context = React.useContext(SelectContext);
      return <button onClick={() => context.onValueChange(value)}>{children}</button>;
    },
  };
});

jest.mock("@/components/ui/table", () => ({
  __esModule: true,
  Table: ({ children, ...props }) => <table {...props}>{children}</table>,
  TableHeader: ({ children, ...props }) => <thead {...props}>{children}</thead>,
  TableBody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
  TableRow: ({ children, ...props }) => <tr {...props}>{children}</tr>,
  TableHead: ({ children, ...props }) => <th {...props}>{children}</th>,
  TableCell: ({ children, ...props }) => <td {...props}>{children}</td>,
}));

jest.mock("@/modals/userManagementModal", () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));

jest.mock("@/modals/confirmationModal", () => {
  const ConfirmationModal = ({ children }) => <>{children}</>;
  ConfirmationModal.Content = ({ children }) => <>{children}</>;
  ConfirmationModal.Trigger = ({ children }) => <>{children}</>;
  return {
    __esModule: true,
    default: ConfirmationModal,
  };
});

function renderPage() {
  return render(
    <AuthContext.Provider
      value={{
        userData: {
          id: "root",
          username: "root",
          nickname: "Root",
          is_active: true,
          is_superuser: true,
          is_reviewer: true,
          profile_image: "",
          create_at: new Date(),
          updated_at: new Date(),
        },
      }}
    >
      <AdminPage />
    </AuthContext.Provider>,
  );
}

describe("AdminPage notification interactions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getUsersHookCall = 0;
    mockNavigate.mockReset();
    mockSetSuccessData.mockReset();
    mockSetErrorData.mockReset();
    mockCreateAdminNotification.mockReset();
    mockGetUsersMutate.mockReset();
    mockGetSelectableUsersMutate.mockReset();

    mockGetUsersMutate.mockImplementation((_params, options) => {
      options?.onSuccess?.({ total_count: 0, users: [] });
    });
    mockGetSelectableUsersMutate.mockImplementation((_params, options) => {
      options?.onSuccess?.({ users: selectableUsers });
    });
    mockCreateAdminNotification.mockImplementation((_payload, options) => {
      options?.onSuccess?.({
        id: "new-notice",
        title: "系统维护通知",
        content: "今晚 22:00 开始维护，请提前保存内容。",
        link: null,
        target_type: "USERS",
        created_at: "2026-03-15T03:00:00Z",
        expires_at: "2026-03-22T03:00:00Z",
        recipient_count: 1,
      });
    });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it("sends a user-targeted notification after selecting a recipient", () => {
    renderPage();

    act(() => {
      jest.runOnlyPendingTimers();
    });

    fireEvent.click(screen.getAllByText("指定用户")[0]);
    fireEvent.change(screen.getByTestId("admin-notification-title"), {
      target: { value: "系统维护通知" },
    });
    fireEvent.change(screen.getByTestId("admin-notification-content"), {
      target: { value: "今晚 22:00 开始维护，请提前保存内容。" },
    });

    const userLabel = screen.getByText("Alice").closest("label");
    expect(userLabel).not.toBeNull();
    fireEvent.click(within(userLabel as HTMLElement).getByRole("checkbox"));

    fireEvent.click(screen.getByTestId("admin-notification-submit"));

    expect(mockCreateAdminNotification).toHaveBeenCalledWith(
      {
        title: "系统维护通知",
        content: "今晚 22:00 开始维护，请提前保存内容。",
        link: null,
        target_type: "USERS",
        user_ids: ["user-1"],
        team_ids: [],
      },
      expect.any(Object),
    );
    expect(mockSetSuccessData).toHaveBeenCalledWith({
      title: "通知已发送，7 天后将自动过期",
    });
    expect(screen.getByTestId("admin-notification-title")).toHaveValue("");
  });

  it("filters and expands notification history", () => {
    renderPage();

    fireEvent.change(screen.getByTestId("admin-notification-history-search"), {
      target: { value: "维护" },
    });

    expect(screen.getByTestId("admin-notification-history-item-notice-1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("admin-notification-history-item-notice-2"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("https://example.com/maintenance")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("admin-notification-history-toggle-notice-1"));

    expect(screen.getByText("https://example.com/maintenance")).toBeInTheDocument();
  });
});
