import { lazy } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
} from "react-router-dom";
import {
  ProtectedAdminRoute,
  ProtectedReviewRoute,
} from "./components/authorization/authAdminGuard";
import { ProtectedRoute } from "./components/authorization/authGuard";
import { ProtectedLoginRoute } from "./components/authorization/authLoginGuard";
import { AuthSettingsGuard } from "./components/authorization/authSettingsGuard";
import ContextWrapper from "./contexts";
import CustomDashboardWrapperPage from "./customization/components/custom-DashboardWrapperPage";
import { CustomNavigate } from "./customization/components/custom-navigate";
import { BASENAME } from "./customization/config-constants";
import {
  ENABLE_CUSTOM_PARAM,
  ENABLE_FILE_MANAGEMENT,
  ENABLE_KNOWLEDGE_BASES,
} from "./customization/feature-flags";
import { CustomRoutesStore } from "./customization/utils/custom-routes-store";
import { CustomRoutesStorePages } from "./customization/utils/custom-routes-store-pages";
import { AppAuthenticatedPage } from "./pages/AppAuthenticatedPage";
import { AppInitPage } from "./pages/AppInitPage";
import { AppWrapperPage } from "./pages/AppWrapperPage";
import TVPage from "./pages/Community/TVPage";
import TVPublishPage from "./pages/Community/TVPublishPage";
import WorkflowsPage from "./pages/Community/WorkflowsPage";
import FlowPage from "./pages/FlowPage";
import HomeLandingPage from "./pages/HomeLandingPage";
import LoginPage from "./pages/LoginPage";
import FilesPage from "./pages/MainPage/pages/filesPage";
import HomePage from "./pages/MainPage/pages/homePage";
import KnowledgePage from "./pages/MainPage/pages/knowledgePage";
import CollectionPage from "./pages/MainPage/pages/main-page";
import SettingsPage from "./pages/SettingsPage";
import ApiKeysPage from "./pages/SettingsPage/pages/ApiKeysPage";
import GeneralPage from "./pages/SettingsPage/pages/GeneralPage";
import MessagesPage from "./pages/SettingsPage/pages/messagesPage";
import ModelConfigPage from "./pages/SettingsPage/pages/ModelConfigPage";
import ProviderCredentialsPage from "./pages/SettingsPage/pages/ProviderCredentialsPage";
import ShortcutsPage from "./pages/SettingsPage/pages/ShortcutsPage";
import ViewPage from "./pages/ViewPage";

const AdminPage = lazy(() => import("./pages/AdminPage"));
const LoginAdminPage = lazy(() => import("./pages/AdminPage/LoginPage"));
const AdminCommunityPage = lazy(
  () => import("./pages/AdminPage/CommunityPage"),
);
const DeleteAccountPage = lazy(() => import("./pages/DeleteAccountPage"));

const PlaygroundPage = lazy(() => import("./pages/Playground"));

const SignUp = lazy(() => import("./pages/SignUpPage"));

const router = createBrowserRouter(
  createRoutesFromElements([
    <Route path="/playground/:id/">
      <Route
        path=""
        element={
          <ContextWrapper key={1}>
            <PlaygroundPage />
          </ContextWrapper>
        }
      />
    </Route>,
    <Route path="/flow-view/:id/">
      <Route
        path=""
        element={
          <ContextWrapper key={3}>
            <ViewPage publicPreview />
          </ContextWrapper>
        }
      />
    </Route>,
    <Route
      path={ENABLE_CUSTOM_PARAM ? "/:customParam?" : "/"}
      element={
        <ContextWrapper key={2}>
          <Outlet />
        </ContextWrapper>
      }
    >
      <Route path="" element={<AppInitPage />}>
        <Route path="" element={<AppWrapperPage />}>
          <Route path="community" element={<CustomDashboardWrapperPage />}>
            <Route index element={<CustomNavigate replace to={"tv"} />} />
            <Route path="tv" element={<TVPage />} />
            <Route path="tv/publish" element={<TVPublishPage />} />
            <Route path="workflows" element={<WorkflowsPage />} />
          </Route>
          <Route
            path=""
            element={
              <ProtectedRoute>
                <Outlet />
              </ProtectedRoute>
            }
          >
            <Route path="" element={<AppAuthenticatedPage />}>
              <Route path="" element={<CustomDashboardWrapperPage />}>
                <Route path="home" element={<HomeLandingPage />} />
                <Route path="" element={<CollectionPage />}>
                  <Route
                    index
                    element={<CustomNavigate replace to={"/home"} />}
                  />
                  {ENABLE_FILE_MANAGEMENT && (
                    <Route path="assets">
                      <Route
                        index
                        element={<CustomNavigate replace to="files" />}
                      />
                      <Route path="files" element={<FilesPage />} />
                      {ENABLE_KNOWLEDGE_BASES && (
                        <Route
                          path="knowledge-bases"
                          element={<KnowledgePage />}
                        />
                      )}
                    </Route>
                  )}
                  <Route
                    path="flows/"
                    element={<HomePage key="flows" type="flows" />}
                  />
                  <Route
                    path="components/"
                    element={<HomePage key="components" type="components" />}
                  >
                    <Route
                      path="folder/:folderId"
                      element={<HomePage key="components" type="components" />}
                    />
                  </Route>
                  <Route
                    path="all/"
                    element={<HomePage key="flows" type="flows" />}
                  >
                    <Route
                      path="folder/:folderId"
                      element={<HomePage key="flows" type="flows" />}
                    />
                  </Route>
                </Route>
                <Route path="settings" element={<SettingsPage />}>
                  <Route
                    index
                    element={<CustomNavigate replace to={"general"} />}
                  />
                  <Route path="model-config" element={<ModelConfigPage />} />
                  <Route
                    path="provider-credentials"
                    element={<ProviderCredentialsPage />}
                  />
                  <Route path="api-keys" element={<ApiKeysPage />} />
                  <Route
                    path="general/:scrollId?"
                    element={
                      <AuthSettingsGuard>
                        <GeneralPage />
                      </AuthSettingsGuard>
                    }
                  />
                  <Route path="shortcuts" element={<ShortcutsPage />} />
                  <Route path="messages" element={<MessagesPage />} />
                  {CustomRoutesStore()}
                </Route>
                {CustomRoutesStorePages()}
                <Route path="account">
                  <Route path="delete" element={<DeleteAccountPage />}></Route>
                </Route>
                <Route
                  path="admin"
                  element={
                    <ProtectedAdminRoute>
                      <AdminPage />
                    </ProtectedAdminRoute>
                  }
                />
                <Route
                  path="admin/community"
                  element={
                    <ProtectedReviewRoute>
                      <AdminCommunityPage />
                    </ProtectedReviewRoute>
                  }
                />
              </Route>
              <Route path="flow/:id/">
                <Route path="" element={<CustomDashboardWrapperPage />}>
                  <Route path="folder/:folderId/" element={<FlowPage />} />
                  <Route path="" element={<FlowPage />} />
                </Route>
                <Route path="view" element={<ViewPage />} />
              </Route>
            </Route>
          </Route>
          <Route
            path="login"
            element={
              <ProtectedLoginRoute>
                <LoginPage />
              </ProtectedLoginRoute>
            }
          />
          <Route
            path="signup"
            element={
              <ProtectedLoginRoute>
                <SignUp />
              </ProtectedLoginRoute>
            }
          />
          <Route
            path="login/admin"
            element={
              <ProtectedLoginRoute>
                <LoginAdminPage />
              </ProtectedLoginRoute>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<CustomNavigate replace to="/" />} />
    </Route>,
  ]),
  { basename: BASENAME || undefined },
);

export default router;
