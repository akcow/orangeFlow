import {
  BellRing,
  CircleDollarSign,
  LayoutDashboard,
  ShieldCheck,
  Users2,
  Waypoints,
} from "lucide-react";
import type { ReactNode } from "react";
import { useContext } from "react";
import { useLocation } from "react-router-dom";
import {
  Button,
  Card,
  Col,
  ConfigProvider,
  Grid,
  Layout,
  Menu,
  Row,
  Space,
  Tag,
  Typography,
  theme as antdTheme,
} from "antd";
import { AuthContext } from "@/contexts/authContext";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import CommunityModerationPanel from "./CommunityModerationPanel";
import AdminCreditsPage from "./CreditsPage";
import AdminPage from "./index";
import AdminRelayWorkspace from "./AdminRelayWorkspace";

const { Title, Paragraph, Text } = Typography;

type AdminSectionKey =
  | "overview"
  | "users"
  | "credits"
  | "moderation"
  | "relays";

type AdminNavItem = {
  key: AdminSectionKey;
  label: string;
  icon: ReactNode;
  path: string;
  description: string;
};

function getSelectedSection(pathname: string, isAdmin: boolean): AdminSectionKey {
  if (pathname.endsWith("/users")) {
    return "users";
  }
  if (pathname.endsWith("/credits")) {
    return "credits";
  }
  if (pathname.endsWith("/community")) {
    return "moderation";
  }
  if (pathname.endsWith("/provider-relays")) {
    return "relays";
  }
  return isAdmin ? "overview" : "moderation";
}

function SectionHeader({
  title,
  description,
  extra,
}: {
  title: string;
  description: string;
  extra?: ReactNode;
}) {
  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 24,
        background:
          "linear-gradient(135deg, rgba(17,24,39,0.96) 0%, rgba(12,18,30,0.96) 100%)",
        border: "1px solid rgba(148, 163, 184, 0.12)",
        boxShadow: "0 28px 80px rgba(0, 0, 0, 0.28)",
      }}
      styles={{ body: { padding: 28 } }}
    >
      <Row gutter={[16, 16]} justify="space-between" align="middle">
        <Col xs={24} md={16}>
          <Space direction="vertical" size={8}>
            <Title level={3} style={{ margin: 0, color: "#f8fafc" }}>
              {title}
            </Title>
            <Paragraph style={{ margin: 0, color: "rgba(226, 232, 240, 0.72)" }}>
              {description}
            </Paragraph>
          </Space>
        </Col>
        {extra ? <Col xs={24} md="auto">{extra}</Col> : null}
      </Row>
    </Card>
  );
}

function DarkPanel({
  children,
  bodyPadding = 20,
}: {
  children: ReactNode;
  bodyPadding?: number;
}) {
  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 24,
        background: "rgba(9, 14, 24, 0.9)",
        border: "1px solid rgba(148, 163, 184, 0.12)",
        boxShadow: "0 24px 72px rgba(0, 0, 0, 0.22)",
      }}
      styles={{ body: { padding: bodyPadding } }}
    >
      {children}
    </Card>
  );
}

export default function AdminConsolePage() {
  const navigate = useCustomNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const { userData } = useContext(AuthContext);
  const isAdmin = !!userData?.is_superuser;

  const navItems: AdminNavItem[] = isAdmin
    ? [
        {
          key: "overview",
          label: "控制台总览",
          icon: <LayoutDashboard size={16} />,
          path: "/admin",
          description:
            "把用户管理、通知投放、积分管理、内容审核和供应商路由统一收口到一个后台入口。",
        },
        {
          key: "users",
          label: "用户与通知",
          icon: <Users2 size={16} />,
          path: "/admin/users",
          description:
            "保留旧版用户中心的用户管理和通知投放能力，但不再单独维护独立页面。",
        },
        {
          key: "credits",
          label: "积分管理",
          icon: <CircleDollarSign size={16} />,
          path: "/admin/credits",
          description: "查看用户积分余额、消耗和充值数据，并执行人工调账。",
        },
        {
          key: "moderation",
          label: "内容审核",
          icon: <ShieldCheck size={16} />,
          path: "/admin/community",
          description: "集中处理社区内容审核、查看详情、执行批量通过或驳回。",
        },
        {
          key: "relays",
          label: "供应商路由",
          icon: <Waypoints size={16} />,
          path: "/admin/provider-relays",
          description:
            "管理模型供应商中转线路，支持默认线路、一键置顶、拖拽排序和 Base URL 切换。",
        },
      ]
    : [
        {
          key: "moderation",
          label: "内容审核",
          icon: <ShieldCheck size={16} />,
          path: "/admin/community",
          description: "审核员在这里集中处理社区内容审核。",
        },
      ];

  const selectedSection = getSelectedSection(location.pathname, isAdmin);
  const selectedItem =
    navItems.find((item) => item.key === selectedSection) ?? navItems[0];

  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: "#4f8cff",
          colorInfo: "#4f8cff",
          colorSuccess: "#37c47a",
          colorWarning: "#f5b84d",
          colorError: "#ff6b6b",
          colorBgBase: "#05070b",
          colorBgContainer: "#0b1120",
          colorBorderSecondary: "rgba(148, 163, 184, 0.12)",
          borderRadius: 16,
          fontSize: 14,
        },
        components: {
          Card: {
            colorBgContainer: "#0b1120",
          },
          Layout: {
            bodyBg: "#05070b",
            headerBg: "#05070b",
            siderBg: "#05070b",
          },
          Menu: {
            darkItemBg: "#0b1120",
            darkSubMenuItemBg: "#0b1120",
            darkItemSelectedBg: "rgba(79, 140, 255, 0.18)",
            darkItemSelectedColor: "#90b4ff",
            darkItemHoverBg: "rgba(148, 163, 184, 0.12)",
            itemBorderRadius: 14,
          },
        },
      }}
    >
      <div
        className="dark h-full min-h-0 w-full overflow-y-auto overflow-x-hidden"
        style={{
          background:
            "radial-gradient(circle at top left, rgba(59,130,246,0.14), transparent 30%), radial-gradient(circle at top right, rgba(14,165,233,0.14), transparent 28%), linear-gradient(180deg, #05070b 0%, #070b14 100%)",
        }}
      >
        <div
          style={{
            width: "100%",
            minHeight: "100%",
            padding: screens.lg ? 24 : 16,
          }}
        >
          <Layout style={{ width: "100%", background: "transparent" }}>
            <SectionHeader
              title={isAdmin ? "中后台控制台" : "内容审核工作台"}
              description={
                isAdmin
                  ? "积分管理、内容审核、供应商路由和旧版用户中心能力已经整合到一个页面。管理员可直接在这里切换 Base URL 线路、调整优先级，并处理平台运营事务。"
                  : "这里保留审核员最核心的内容审核能力。"
              }
              extra={
                isAdmin ? (
                  <Space wrap>
                    <Tag color="blue">深色主题</Tag>
                    <Tag color="gold">统一中后台</Tag>
                    <Tag color="cyan">Ant Design</Tag>
                    <Button
                      onClick={() => navigate("/admin/users")}
                      icon={<BellRing size={16} />}
                    >
                      用户与通知
                    </Button>
                  </Space>
                ) : (
                  <Tag color="blue">审核员入口</Tag>
                )
              }
            />

            <Row gutter={[20, 20]} style={{ marginTop: 20, width: "100%" }}>
              <Col xs={24} lg={6}>
                <Space direction="vertical" size={20} style={{ width: "100%" }}>
                  <DarkPanel>
                    <Menu
                      theme="dark"
                      selectedKeys={[selectedSection]}
                      mode={screens.lg ? "inline" : "horizontal"}
                      items={navItems.map((item) => ({
                        key: item.key,
                        icon: item.icon,
                        label: item.label,
                      }))}
                      onClick={({ key }) => {
                        const item = navItems.find((entry) => entry.key === key);
                        if (item) {
                          navigate(item.path);
                        }
                      }}
                      style={{
                        borderInlineEnd: "none",
                        background: "transparent",
                      }}
                    />
                  </DarkPanel>

                  <DarkPanel>
                    <Space direction="vertical" size={10}>
                      <Text strong style={{ color: "#f8fafc" }}>
                        {selectedItem.label}
                      </Text>
                      <Paragraph
                        style={{ marginBottom: 0, color: "rgba(226, 232, 240, 0.72)" }}
                      >
                        {selectedItem.description}
                      </Paragraph>
                      {selectedSection === "relays" ? (
                        <>
                          <Tag color="green">默认线路</Tag>
                          <Tag color="processing">一键置顶</Tag>
                          <Tag color="purple">拖拽排序</Tag>
                        </>
                      ) : null}
                    </Space>
                  </DarkPanel>
                </Space>
              </Col>

              <Col xs={24} lg={18}>
                <Space direction="vertical" size={20} style={{ width: "100%" }}>
                  {selectedSection === "overview" && isAdmin ? (
                    <>
                      <SectionHeader
                        title="后台能力总览"
                        description="从这里进入各个后台能力模块。每个模块都已经合并到统一中后台中，不再分散成多个旧页面。"
                      />
                      <Row gutter={[16, 16]}>
                        {navItems
                          .filter((item) => item.key !== "overview")
                          .map((item) => (
                            <Col xs={24} md={12} xl={8} key={item.key}>
                              <DarkPanel>
                                <Space
                                  direction="vertical"
                                  size={14}
                                  style={{ width: "100%" }}
                                >
                                  <Space size={10}>
                                    {item.icon}
                                    <Text strong style={{ color: "#f8fafc" }}>
                                      {item.label}
                                    </Text>
                                  </Space>
                                  <Paragraph
                                    style={{
                                      minHeight: 72,
                                      marginBottom: 0,
                                      color: "rgba(226, 232, 240, 0.72)",
                                    }}
                                  >
                                    {item.description}
                                  </Paragraph>
                                  <Button type="primary" block onClick={() => navigate(item.path)}>
                                    进入{item.label}
                                  </Button>
                                </Space>
                              </DarkPanel>
                            </Col>
                          ))}
                      </Row>
                    </>
                  ) : null}

                  {selectedSection === "users" && isAdmin ? (
                    <>
                      <SectionHeader
                        title="用户与通知"
                        description="旧版用户中心的用户管理、通知投放、通知历史和用户操作能力已经直接并入统一中后台。"
                      />
                      <DarkPanel bodyPadding={12}>
                        <AdminPage embedded showAdminLinks={false} />
                      </DarkPanel>
                    </>
                  ) : null}

                  {selectedSection === "credits" ? (
                    <>
                      <SectionHeader
                        title="积分管理"
                        description="查看用户积分余额、总消耗、总充值，并支持人工调账与最近流水查询。"
                      />
                      <DarkPanel bodyPadding={12}>
                        <AdminCreditsPage embedded />
                      </DarkPanel>
                    </>
                  ) : null}

                  {selectedSection === "moderation" ? (
                    <>
                      <SectionHeader
                        title="内容审核"
                        description="按状态、类型、用户与时间过滤审核队列，支持批量处理与详情查看。"
                      />
                      <DarkPanel bodyPadding={12}>
                        <CommunityModerationPanel />
                      </DarkPanel>
                    </>
                  ) : null}

                  {selectedSection === "relays" ? (
                    <>
                      <SectionHeader
                        title="供应商路由"
                        description="在管理后台直接维护模型供应商线路，支持配置 Base URL、中转站 API Key、默认线路与优先级。"
                      />
                      <AdminRelayWorkspace />
                    </>
                  ) : null}
                </Space>
              </Col>
            </Row>
          </Layout>
        </div>
      </div>
    </ConfigProvider>
  );
}
