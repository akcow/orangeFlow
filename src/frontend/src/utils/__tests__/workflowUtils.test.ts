jest.mock("@/controllers/API/helpers/constants", () => ({
  getURL: jest.fn(() => "/api/v2/files/download"),
}));

import {
  extractLatestImageFromFlow,
  guessWorkflowCoverFromSelection,
} from "../workflowUtils";

describe("workflowUtils image extraction", () => {
  it("prefers latest draft_output preview over older file inputs", () => {
    const flow = {
      data: {
        nodes: [
          {
            id: "input-node",
            data: {
              node: {
                template: {
                  image_input: {
                    file_path: "uploads/original.png",
                  },
                },
              },
            },
          },
          {
            id: "creator-node",
            data: {
              node: {
                template: {
                  image_input: {
                    file_path: "uploads/reference.png",
                  },
                  draft_output: {
                    value: {
                      images: [
                        {
                          image_url: "/api/v1/files/images/flow-1/generated-latest",
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
      },
    } as any;

    expect(extractLatestImageFromFlow(flow)).toBe(
      "/api/v1/files/images/flow-1/generated-latest",
    );
  });

  it("uses draft_output as workflow cover before static file_path inputs", () => {
    const nodes = [
      {
        id: "node-1",
        data: {
          node: {
            template: {
              image_input: {
                file_path: "assets/input.png",
              },
            },
          },
        },
      },
      {
        id: "node-2",
        data: {
          node: {
            template: {
              draft_output: {
                value: {
                  images: [
                    {
                      preview_data_url: "data:image/png;base64,latest-preview",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ] as any;

    expect(guessWorkflowCoverFromSelection(nodes)).toBe(
      "data:image/png;base64,latest-preview",
    );
  });

  it("keeps presigned object-storage URLs as the latest workflow image", () => {
    const signedUrl =
      "https://cdn.example.com/langflow-assets/flow-9/images/render.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=test";
    const flow = {
      data: {
        nodes: [
          {
            id: "creator-node",
            data: {
              node: {
                template: {
                  draft_output: {
                    value: {
                      images: [
                        {
                          image_url: signedUrl,
                          generated_at: "2026-03-10T11:00:00Z",
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
      },
    } as any;

    expect(extractLatestImageFromFlow(flow)).toBe(signedUrl);
  });

  it("uses remote object-storage preview URLs as workflow cover", () => {
    const remotePreview =
      "https://minio.example.com/langflow-assets/flow-10/images/preview.webp?X-Amz-Signature=cover";
    const nodes = [
      {
        id: "node-remote-preview",
        data: {
          node: {
            template: {
              draft_output: {
                value: {
                  images: [
                    {
                      image_url: remotePreview,
                    },
                  ],
                },
              },
            },
          },
        },
      },
      {
        id: "node-fallback-file",
        data: {
          node: {
            template: {
              image_input: {
                file_path: "assets/older-input.png",
              },
            },
          },
        },
      },
    ] as any;

    expect(guessWorkflowCoverFromSelection(nodes)).toBe(remotePreview);
  });

  it("normalizes tokenized public-inline image URLs to stable internal image routes", () => {
    const tokenizedUrl =
      "https://app.example.com/api/v1/files/public-inline/flow-11/images/output.png?token=abc";
    const flow = {
      data: {
        nodes: [
          {
            id: "creator-node",
            data: {
              node: {
                template: {
                  draft_output: {
                    value: {
                      images: [{ image_url: tokenizedUrl }],
                    },
                  },
                },
              },
            },
          },
        ],
      },
    } as any;

    expect(extractLatestImageFromFlow(flow)).toBe(
      "https://app.example.com/api/v1/files/images/flow-11/images/output.png",
    );
  });
});
