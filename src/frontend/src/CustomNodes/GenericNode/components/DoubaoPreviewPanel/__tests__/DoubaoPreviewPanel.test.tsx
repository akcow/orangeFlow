import { fireEvent, render, screen } from "@testing-library/react";
import DoubaoPreviewPanel from "../index";
import { useDoubaoPreview } from "../../../../hooks/use-doubao-preview";

jest.mock("../../../../hooks/use-doubao-preview", () => {
  const mock = jest.fn();
  return {
    __esModule: true,
    useDoubaoPreview: mock,
    default: mock,
  };
});

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@/components/common/genericIconComponent", () => ({
  __esModule: true,
  ForwardedIconComponent: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  default: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

jest.mock("@/components/common/ImageViewer", () => ({
  __esModule: true,
  default: ({ image }: { image: string }) => (
    <div data-testid="image-viewer">viewer:{image}</div>
  ),
}));

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: jest.fn(),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: jest.fn().mockResolvedValue(undefined),
  });
});

describe("DoubaoPreviewPanel", () => {
  const mockNodeId = "test-node-id";
  const mockComponentName = "DoubaoImageCreator";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders empty preview state when no data available", () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: null,
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={mockComponentName}
      />,
    );

    expect(screen.getByText("暂无生成结果")).toBeInTheDocument();
  });

  test("renders building state when isBuilding is true", () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: null,
      isBuilding: true,
      rawMessage: null,
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={mockComponentName}
      />,
    );

    expect(screen.getByText("构建中，稍后自动更新")).toBeInTheDocument();
  });

  test("renders error state when preview has error", () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: {
        kind: "image",
        available: false,
        error: "API Error: Failed to generate image",
        token: "test-token",
      },
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={mockComponentName}
      />,
    );

    expect(screen.getByText("预览失败")).toBeInTheDocument();
  });

  test("renders image preview when image data is available", async () => {
    const mockImagePreview = {
      kind: "image" as const,
      available: true,
      payload: {
        image_data_url:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        width: 512,
        height: 512,
      },
      token: "test-token",
    };

    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: mockImagePreview,
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={mockComponentName}
      />,
    );

    const expandButton = await screen.findByRole("button", {
      name: "放大预览",
    });
    fireEvent.click(expandButton);
    expect(await screen.findByText("生成结果详情")).toBeInTheDocument();
    const saveButtons = await screen.findAllByText("下载结果");
    expect(saveButtons).toHaveLength(2);
    expect(await screen.findByText("512×512")).toBeInTheDocument();
  });

  test("supports multi image carousel navigation", async () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: {
        kind: "image",
        available: true,
        payload: {
          images: [
            { image_url: "https://example.com/a.png", size: "1024×1024" },
            { image_url: "https://example.com/b.png", size: "2048×2048" },
          ],
        },
        token: "gallery-token",
      },
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={mockComponentName}
      />,
    );

    expect(await screen.findByText("第 1 / 2 张")).toBeInTheDocument();
    fireEvent.click(await screen.findByLabelText("下一张"));
    expect(await screen.findByText("第 2 / 2 张")).toBeInTheDocument();
    fireEvent.click(await screen.findByLabelText("上一张"));
    expect(await screen.findByText("第 1 / 2 张")).toBeInTheDocument();
  });

  test("renders video preview when video data is available", async () => {
    const mockVideoPreview = {
      kind: "video" as const,
      available: true,
      payload: {
        video_url: "https://example.com/video.mp4",
        cover_preview_base64:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        duration: "00:10",
      },
      token: "test-token",
    };

    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: mockVideoPreview,
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoVideoGenerator"}
      />,
    );

    await screen.findByText("放大预览");
    expect(await screen.findByText("预计时长：00:10")).toBeInTheDocument();
    const saveButtons = await screen.findAllByText("下载结果");
    expect(saveButtons).toHaveLength(1);
  });

  test("renders audio preview when audio data is available", async () => {
    const mockAudioPreview = {
      kind: "audio" as const,
      available: true,
      payload: {
        audio_base64:
          "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
        audio_type: "mp3",
      },
      token: "test-token",
    };

    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: mockAudioPreview,
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel nodeId={mockNodeId} componentName={"DoubaoTTS"} />,
    );

    await screen.findByText("放大预览");
    const saveButtons = await screen.findAllByText("下载结果");
    expect(saveButtons).toHaveLength(1);
  });
});
