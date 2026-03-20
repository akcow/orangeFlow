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

const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminCreditsPage = lazy(() => import("./pages/AdminPage/CreditsPage"));
const LoginAdminPage = lazy(() => import("./pages/AdminPage/LoginPage"));
const AdminCommunityPage = lazy(
  () => import("./pages/AdminPage/CommunityPage"),
);
const ApiKeysPage = lazy(() => import("./pages/SettingsPage/pages/ApiKeysPage"));
const CollectionPage = lazy(() => import("./pages/MainPage/pages/main-page"));
const DeleteAccountPage = lazy(() => import("./pages/DeleteAccountPage"));
const FilesPage = lazy(() => import("./pages/MainPage/pages/filesPage"));
const FlowPage = lazy(() => import("./pages/FlowPage"));
const GeneralPage = lazy(() => import("./pages/SettingsPage/pages/GeneralPage"));
const HomeLandingPage = lazy(() => import("./pages/HomeLandingPage"));
const HomePage = lazy(() => import("./pages/MainPage/pages/homePage"));
const KnowledgePage = lazy(() => import("./pages/MainPage/pages/knowledgePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MessagesPage = lazy(() => import("./pages/SettingsPage/pages/messagesPage"));
const ModelConfigPage = lazy(() => import("./pages/SettingsPage/pages/ModelConfigPage"));
const PlaygroundPage = lazy(() => import("./pages/Playground"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const ProviderCredentialsPage = lazy(
  () => import("./pages/SettingsPage/pages/ProviderCredentialsPage"),
);
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SignUp = lazy(() => import("./pages/SignUpPage"));
const ShortcutsPage = lazy(() => import("./pages/SettingsPage/pages/ShortcutsPage"));
const TVPage = lazy(() => import("./pages/Community/TVPage"));
const TVPublishPage = lazy(() => import("./pages/Community/TVPublishPage"));
const ViewPage = lazy(() => import("./pages/ViewPage"));
const WorkflowsPage = lazy(() => import("./pages/Community/WorkflowsPage"));

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
          <Route path="" element={<CustomDashboardWrapperPage />}>
            <Route path="community">
              <Route index element={<CustomNavigate replace to={"tv"} />} />
              <Route path="tv" element={<TVPage />} />
              <Route
                path="tv/publish"
                element={
                  <ProtectedRoute>
                    <TVPublishPage />
                  </ProtectedRoute>
                }
              />
              <Route path="workflows" element={<WorkflowsPage />} />
            </Route>
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
                <Route path="profile" element={<ProfilePage />} />
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
                  path="admin/credits"
                  element={
                    <ProtectedAdminRoute>
                      <AdminCreditsPage />
                    </ProtectedAdminRoute>
                  }
                />
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
