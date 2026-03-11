import {
  buildGenerationHistoryItems,
  resolveVideoSource,
} from "../generationHistoryUtils";

function createNode(params: {
  id: string;
  type: string;
  displayName?: string;
  draftOutput?: Record<string, any>;
}) {
  return {
    id: params.id,
    data: {
      type: params.type,
      node: {
        display_name: params.displayName ?? params.type,
        template: params.draftOutput
          ? {
              draft_output: {
                value: params.draftOutput,
              },
            }
          : {},
      },
    },
  } as any;
}

function createImageMessage(params: {
  token: string;
  generatedAt: string;
  imageUrl: string;
}) {
  return {
    doubao_preview: {
      token: params.token,
      kind: "image",
      available: true,
      generated_at: params.generatedAt,
      payload: {
        images: [{ image_url: params.imageUrl }],
      },
    },
  };
}

function createVideoMessage(params: {
  token: string;
  generatedAt: string;
  coverUrl?: string;
  coverPreviewBase64?: string;
  videoUrl?: string;
}) {
  return {
    doubao_preview: {
      token: params.token,
      kind: "video",
      available: true,
      generated_at: params.generatedAt,
      payload: {
        cover_url: params.coverUrl,
        cover_preview_base64: params.coverPreviewBase64,
        videos: params.videoUrl ? [{ video_url: params.videoUrl }] : undefined,
      },
    },
  };
}

describe("generationHistoryUtils", () => {
  it("builds persisted image history items and preserves object-storage thumbnails", () => {
    const signedImageUrl =
      "https://cdn.example.com/langflow-assets/flow-1/images/out.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=test";
    const nodes = [
      createNode({
        id: "image-node",
        type: "DoubaoImageCreator",
        displayName: "封面图生成",
      }),
    ];
    const flowPool = {
      "image-node": [
        {
          timestamp: "2026-03-10T08:00:00Z",
          data: {
            outputs: {
              image: {
                message: createImageMessage({
                  token: "img-1",
                  generatedAt: "2026-03-10T08:00:00Z",
                  imageUrl: signedImageUrl,
                }),
              },
            },
          },
        },
      ],
    } as any;

    const items = buildGenerationHistoryItems(flowPool, nodes);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "image-img-1",
      kind: "image",
      generatedAt: "2026-03-10T08:00:00Z",
      generatedDate: "2026-03-10",
      sourceNodeName: "封面图生成",
      thumbnail: signedImageUrl,
    });
  });

  it("falls back to node draft_output when no persisted build exists", () => {
    const draftImageUrl =
      "https://minio.example.com/langflow-assets/flow-2/images/draft.png?X-Amz-Signature=draft";
    const nodes = [
      createNode({
        id: "draft-node",
        type: "DoubaoImageCreator",
        draftOutput: createImageMessage({
          token: "draft-1",
          generatedAt: "2026-03-10T09:00:00Z",
          imageUrl: draftImageUrl,
        }),
      }),
    ];

    const items = buildGenerationHistoryItems({}, nodes);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "image-draft-1",
      kind: "image",
      thumbnail: draftImageUrl,
      generatedDate: "2026-03-10",
    });
  });

  it("deduplicates draft_output against persisted history by preview token", () => {
    const persistedUrl =
      "https://cdn.example.com/langflow-assets/flow-3/images/persisted.png?X-Amz-Signature=persisted";
    const draftUrl =
      "https://cdn.example.com/langflow-assets/flow-3/images/draft.png?X-Amz-Signature=draft";
    const nodes = [
      createNode({
        id: "node-1",
        type: "DoubaoImageCreator",
        draftOutput: createImageMessage({
          token: "same-token",
          generatedAt: "2026-03-10T10:05:00Z",
          imageUrl: draftUrl,
        }),
      }),
    ];
    const flowPool = {
      "node-1": [
        {
          timestamp: "2026-03-10T10:00:00Z",
          data: {
            outputs: {
              image: {
                message: createImageMessage({
                  token: "same-token",
                  generatedAt: "2026-03-10T10:00:00Z",
                  imageUrl: persistedUrl,
                }),
              },
            },
          },
        },
      ],
    } as any;

    const items = buildGenerationHistoryItems(flowPool, nodes);

    expect(items).toHaveLength(1);
    expect(items[0]?.thumbnail).toBe(persistedUrl);
  });

  it("extracts remote and inline video covers and playable source", () => {
    const remoteCover = "https://cdn.example.com/langflow-assets/flow-4/video/cover.jpg";
    const videoUrl = "https://cdn.example.com/langflow-assets/flow-4/video/output.mp4";
    const nodes = [createNode({ id: "video-node", type: "DoubaoVideoGenerator" })];
    const flowPool = {
      "video-node": [
        {
          timestamp: "2026-03-10T11:00:00Z",
          data: {
            outputs: {
              video: {
                message: createVideoMessage({
                  token: "video-1",
                  generatedAt: "2026-03-10T11:00:00Z",
                  coverUrl: remoteCover,
                  videoUrl,
                }),
              },
            },
          },
        },
        {
          timestamp: "2026-03-10T11:30:00Z",
          data: {
            outputs: {
              video: {
                message: createVideoMessage({
                  token: "video-2",
                  generatedAt: "2026-03-10T11:30:00Z",
                  coverPreviewBase64: "data:image/png;base64,ZmFrZQ==",
                  videoUrl,
                }),
              },
            },
          },
        },
      ],
    } as any;

    const items = buildGenerationHistoryItems(flowPool, nodes);

    expect(items).toHaveLength(2);
    expect(items[0]?.thumbnail).toBe("data:image/png;base64,ZmFrZQ==");
    expect(items[1]?.thumbnail).toBe(remoteCover);
    expect(resolveVideoSource(items[0]?.payload)).toBe(videoUrl);
  });

  it("normalizes tokenized public-inline preview URLs to stable in-app routes", () => {
    const tokenizedUrl =
      "https://app.example.com/api/v1/files/public-inline/flow-5/images/output.png?token=abc";
    const nodes = [
      createNode({
        id: "image-node",
        type: "DoubaoImageCreator",
        draftOutput: createImageMessage({
          token: "img-inline",
          generatedAt: "2026-03-10T12:00:00Z",
          imageUrl: tokenizedUrl,
        }),
      }),
    ];

    const items = buildGenerationHistoryItems({}, nodes);

    expect(items[0]?.thumbnail).toBe(
      "https://app.example.com/api/v1/files/images/flow-5/images/output.png",
    );
  });
});
