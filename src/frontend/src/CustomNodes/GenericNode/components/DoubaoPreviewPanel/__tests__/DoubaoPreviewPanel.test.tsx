import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DoubaoPreviewPanel from "../index";
import { useDoubaoPreview } from "../../../../hooks/use-doubao-preview";

jest.mock("@/controllers/API/queries/files/use-post-upload-file", () => ({
  __esModule: true,
  usePostUploadFile: () => ({
    mutateAsync: jest.fn().mockResolvedValue({ file_path: "files/images/mock-flow/outpaint.png" }),
  }),
}));

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
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["test"]),
  } as any);

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

  test("uses aspect-ratio padding geometry for 21:9 image creator preview", async () => {
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
        appearance="imageCreator"
        aspectRatio="21:9"
      />,
    );

    const frame = await screen.findByTestId("doubao-preview-frame");
    expect(frame).toHaveStyle({ paddingBottom: "42.86%" });
  });

  test("persistent image creator frame does not use transition-all", async () => {
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
        appearance="imageCreator"
        aspectRatio="16:9"
      />,
    );

    const frame = await screen.findByTestId("doubao-preview-frame");
    expect(frame.className).not.toContain("transition-all");
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

    expect(screen.getByText("生成中，将自动刷新")).toBeInTheDocument();
  });

  test("shows wave loading overlay in image creator while building", async () => {
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
        appearance="imageCreator"
      />,
    );

    expect(await screen.findByTestId("doubao-building-wave-overlay")).toBeInTheDocument();
  });

  test("hides inline video controls while wave loading is active", async () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: {
        kind: "video",
        available: true,
        payload: {
          video_url: "https://example.com/video.mp4",
          duration: "00:06",
        },
        token: "video-token",
      },
      isBuilding: true,
      rawMessage: null,
      lastUpdated: undefined,
    });

    const { container } = render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoVideoGenerator"}
        appearance="videoGenerator"
      />,
    );

    expect(await screen.findByTestId("doubao-building-wave-overlay")).toBeInTheDocument();
    expect(container.querySelector('input[type=\"range\"]')).toBeNull();
  });

  test("hides inline audio controls while wave loading is active", async () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: {
        kind: "audio",
        available: true,
        payload: {
          audio_base64:
            "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=",
          audio_type: "mp3",
        },
        token: "audio-token",
      },
      isBuilding: true,
      rawMessage: null,
      lastUpdated: undefined,
    });

    const { container } = render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoTTS"}
        appearance="audioCreator"
      />,
    );

    expect(await screen.findByTestId("doubao-building-wave-overlay")).toBeInTheDocument();
    expect(container.querySelector('input[type=\"range\"]')).toBeNull();
  });

  test("renders failure reason and retry hints when preview has error", () => {
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

    expect(screen.getByText("实时预览")).toBeInTheDocument();
    expect(screen.getByText("生成失败")).toBeInTheDocument();
    expect(screen.getByText("API Error: Failed to generate image")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "联系客服" })).toBeInTheDocument();
  });

  test("does not fall back to upload empty state when image creator build fails", () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: {
        kind: "image",
        available: false,
        error: "生成失败：请求超时",
        token: "image-error-token",
      },
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={mockComponentName}
        appearance="imageCreator"
      />,
    );

    expect(screen.getByText("生成失败")).toBeInTheDocument();
    expect(screen.getByText("生成失败：请求超时")).toBeInTheDocument();
    expect(screen.queryByText("暂无结果，请上传图片")).not.toBeInTheDocument();
  });

  test("reads failure reason from logs when preview payload is unavailable", () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: null,
      isBuilding: false,
      rawMessage: {
        data: {
          outputs: {
            image: [
              {
                type: "error",
                message: {
                  errorMessage: "日志错误：模型网关超时",
                },
              },
            ],
          },
        },
      },
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={mockComponentName}
        appearance="imageCreator"
      />,
    );

    expect(screen.getByText("生成失败")).toBeInTheDocument();
    expect(screen.getByText("日志错误：模型网关超时")).toBeInTheDocument();
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
    expect(await screen.findByText("生成详情")).toBeInTheDocument();
    const inlineDownload = await screen.findAllByText("\u4e0b\u8f7d\u7ed3\u679c");
    expect(inlineDownload).toHaveLength(1);
    expect(await screen.findByText("\u4e0b\u8f7d")).toBeInTheDocument();
    const sizeLabels = await screen.findAllByText("512x512");
    expect(sizeLabels.length).toBeGreaterThanOrEqual(1);
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

  test("renders uploaded reference images (upload button moved to top bar)", async () => {
    const mockUpload = jest.fn();
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
        appearance="imageCreator"
        referenceImages={[
          {
            id: "ref-1",
            imageSource: "https://example.com/uploaded.png",
            size: "600×600",
          },
        ]}
        onRequestUpload={mockUpload}
      />,
    );

    expect(await screen.findByAltText("参考图 1")).toBeInTheDocument();
    // Persistent preview no longer shows an upload overlay button; it lives in the node top bar.
    expect(screen.queryByText("上传")).not.toBeInTheDocument();
  });

  test("fires suggestion click callback in image creator empty state", async () => {
    const mockSuggestionClick = jest.fn();
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
        appearance="imageCreator"
        onSuggestionClick={mockSuggestionClick}
      />,
    );

    fireEvent.click(await screen.findByText("以图生图"));
    expect(mockSuggestionClick).toHaveBeenCalledWith("以图生图");

    fireEvent.click(await screen.findByText("图片换背景"));
    expect(mockSuggestionClick).toHaveBeenCalledWith("图片换背景");

    fireEvent.click(await screen.findByText("首帧图生视频"));
    expect(mockSuggestionClick).toHaveBeenCalledWith("首帧图生视频");
  });

  test("renders video generator empty state suggestions", async () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: null,
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoVideoGenerator"}
        appearance="videoGenerator"
      />,
    );

    expect(await screen.findByText("首帧生成视频")).toBeInTheDocument();
    expect(await screen.findByText("首尾帧生成视频")).toBeInTheDocument();
  });

  test("renders audio generator empty state suggestions", async () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: null,
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoTTS"}
        appearance="audioCreator"
      />,
    );

    expect(await screen.findByText("上传本地音频")).toBeInTheDocument();
    expect(await screen.findByText("暂无生成结果")).toBeInTheDocument();
  });

  test("opens file picker when clicking upload local audio suggestion", async () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: null,
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    const clickSpy = jest
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoTTS"}
        appearance="audioCreator"
      />,
    );

    fireEvent.click(await screen.findByText("上传本地音频"));
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  test("opens file picker and calls suggestion handler when clicking audio to video", async () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: null,
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    const clickSpy = jest
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    const mockSuggestionClick = jest.fn();

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoTTS"}
        appearance="audioCreator"
        onSuggestionClick={mockSuggestionClick}
      />,
    );

    fireEvent.click(await screen.findByText("音频转视频"));
    expect(mockSuggestionClick).toHaveBeenCalledWith("音频转视频");
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
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

    await screen.findByRole("button", { name: "放大预览" });
    expect(await screen.findByText("预计时长：00:10")).toBeInTheDocument();
    const saveButtons = await screen.findAllByText("下载结果");
    expect(saveButtons).toHaveLength(1);
  });

  test("autoplays video on hover in persistent video generator preview and keeps progress bar usable", async () => {
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

    const { container } = render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoVideoGenerator"}
        appearance="videoGenerator"
      />,
    );

    const frame = await screen.findByTestId("doubao-preview-frame");

    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
      expect(container.querySelector('input[type="range"]')).not.toBeNull();
    });

    const playMock = window.HTMLMediaElement.prototype.play as unknown as jest.Mock;
    const pauseMock = window.HTMLMediaElement.prototype.pause as unknown as jest.Mock;
    playMock.mockClear();
    pauseMock.mockClear();

    await act(async () => {
      fireEvent.mouseEnter(frame);
    });
    expect(playMock).toHaveBeenCalled();

    await waitFor(() => {
      expect(container.querySelector('input[type="range"]')).not.toBeNull();
    });

    // When the cursor leaves and comes back, hover autoplay should resume from the same position
    // (do not reset currentTime to 0).
    const videoEl = container.querySelector("video") as HTMLVideoElement | null;
    expect(videoEl).not.toBeNull();
    if (videoEl) {
      videoEl.currentTime = 3.2;
    }

    await act(async () => {
      fireEvent.mouseLeave(frame);
    });
    expect(pauseMock).toHaveBeenCalled();

    await waitFor(() => {
      expect(container.querySelector('input[type="range"]')).not.toBeNull();
    });
    if (videoEl) {
      expect(videoEl.currentTime).toBeCloseTo(3.2, 3);
    }

    playMock.mockClear();
    await act(async () => {
      fireEvent.mouseEnter(frame);
    });
    expect(playMock).toHaveBeenCalled();
    if (videoEl) {
      expect(videoEl.currentTime).toBeCloseTo(3.2, 3);
    }
  });

  test("shows uploaded reference video in persistent video generator preview when no generated output", async () => {
    (useDoubaoPreview as jest.Mock).mockReturnValue({
      preview: null,
      isBuilding: false,
      rawMessage: null,
      lastUpdated: undefined,
    });

    const { container } = render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoVideoGenerator"}
        appearance="videoGenerator"
        referenceImages={[
          {
            id: "ref-video-1",
            imageSource: "/api/v1/files/media/00000000-0000-0000-0000-000000000000/clip.mp4",
            fileName: "clip.mp4",
          },
        ]}
      />,
    );

    const frame = await screen.findByTestId("doubao-preview-frame");

    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
      expect(container.querySelector('input[type=\"range\"]')).not.toBeNull();
    });

    const playMock = window.HTMLMediaElement.prototype.play as unknown as jest.Mock;
    const pauseMock = window.HTMLMediaElement.prototype.pause as unknown as jest.Mock;
    playMock.mockClear();
    pauseMock.mockClear();

    await act(async () => {
      fireEvent.mouseEnter(frame);
    });
    expect(playMock).toHaveBeenCalled();

    await waitFor(() => {
      expect(container.querySelector('input[type=\"range\"]')).not.toBeNull();
    });

    await act(async () => {
      fireEvent.mouseLeave(frame);
    });
    expect(pauseMock).toHaveBeenCalled();

    await waitFor(() => {
      expect(container.querySelector('input[type=\"range\"]')).not.toBeNull();
    });
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
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoTTS"}
        appearance="audioCreator"
      />,
    );

    await screen.findByRole("button", { name: "放大预览" });
    expect(await screen.findByText("上传")).toBeInTheDocument();
    expect(await screen.findByText("保存")).toBeInTheDocument();
  });

  test("opens file picker when clicking upload button in audio preview", async () => {
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

    const clickSpy = jest
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});

    render(
      <DoubaoPreviewPanel
        nodeId={mockNodeId}
        componentName={"DoubaoTTS"}
        appearance="audioCreator"
      />,
    );

    fireEvent.click(await screen.findByText("上传"));
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });
});
