import React from "react";
import { render, screen } from "@testing-library/react";
import { AuthContext } from "@/contexts/authContext";

const authState = {
  isAuthenticated: false,
  autoLogin: false,
  isAdmin: false,
};

jest.mock("@/stores/authStore", () => ({
  __esModule: true,
  default: (selector) => selector(authState),
}));

jest.mock("@/customization/components/custom-navigate", () => ({
  __esModule: true,
  CustomNavigate: ({ to }) => <div data-testid="redirect-target">{to}</div>,
}));

jest.mock("@/pages/LoadingPage", () => ({
  __esModule: true,
  LoadingPage: () => <div data-testid="loading-page">loading</div>,
}));

import {
  ProtectedAdminRoute,
  ProtectedReviewRoute,
} from "../index";

describe("authAdminGuard", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.autoLogin = false;
    authState.isAdmin = false;
  });

  function renderWithAuth(node: React.ReactNode, userData: any = null) {
    return render(
      <AuthContext.Provider value={{ userData } as any}>{node}</AuthContext.Provider>,
    );
  }

  it("shows loading while auth is unresolved", () => {
    renderWithAuth(
      <ProtectedAdminRoute>
        <div>admin</div>
      </ProtectedAdminRoute>,
    );

    expect(screen.getByTestId("loading-page")).toBeInTheDocument();
  });

  it("keeps admin routes blocked until userData is loaded", () => {
    authState.isAuthenticated = true;

    renderWithAuth(
      <ProtectedAdminRoute>
        <div>admin</div>
      </ProtectedAdminRoute>,
      null,
    );

    expect(screen.getByTestId("loading-page")).toBeInTheDocument();
    expect(screen.queryByText("admin")).not.toBeInTheDocument();
  });

  it("redirects non-admin users away from admin routes", () => {
    authState.isAuthenticated = true;
    authState.isAdmin = false;

    renderWithAuth(
      <ProtectedAdminRoute>
        <div>admin</div>
      </ProtectedAdminRoute>,
      { is_superuser: false },
    );

    expect(screen.getByTestId("redirect-target")).toHaveTextContent("/");
  });

  it("renders admin routes for superusers", () => {
    authState.isAuthenticated = true;
    authState.isAdmin = true;

    renderWithAuth(
      <ProtectedAdminRoute>
        <div>admin</div>
      </ProtectedAdminRoute>,
      { is_superuser: true },
    );

    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("keeps review routes blocked until userData is loaded", () => {
    authState.isAuthenticated = true;

    renderWithAuth(
      <ProtectedReviewRoute>
        <div>review</div>
      </ProtectedReviewRoute>,
      null,
    );

    expect(screen.getByTestId("loading-page")).toBeInTheDocument();
    expect(screen.queryByText("review")).not.toBeInTheDocument();
  });
});
