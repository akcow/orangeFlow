import {
  getAvailableVideoGenerationModes,
  getImageRoleCounts,
  normalizeAvailableVideoGenerationMode,
} from "../flowMediaUtils";
import { getLineageHighlightedEdgeIds } from "../flowGraphUtils";
import { isValidConnection } from "../reactflowUtils";

describe("getLineageHighlightedEdgeIds", () => {
  it("collects all upstream and downstream edges for selected nodes", () => {
    const nodes = [
      { id: "node-a" },
      { id: "node-b" },
      { id: "node-c" },
      { id: "node-d" },
      { id: "node-e" },
    ] as any;
    const edges = [
      { id: "edge-ab", source: "node-a", target: "node-b" },
      { id: "edge-bc", source: "node-b", target: "node-c" },
      { id: "edge-bd", source: "node-b", target: "node-d" },
      { id: "edge-de", source: "node-d", target: "node-e" },
    ] as any;

    expect(
      new Set(getLineageHighlightedEdgeIds(["node-b"], nodes, edges)),
    ).toEqual(new Set(["edge-ab", "edge-bc", "edge-bd", "edge-de"]));
  });
});

describe("video generation mode availability", () => {
  it("keeps only text mode when there is no upstream media", () => {
    expect(
      getAvailableVideoGenerationModes("kling O1", {
        hasImageUpstream: false,
        hasVideoUpstream: false,
      }),
    ).toEqual(["text"]);
  });

  it("keeps only image-driven modes for image upstreams", () => {
    expect(
      getAvailableVideoGenerationModes("VEO3.1", {
        hasImageUpstream: true,
        hasVideoUpstream: false,
      }),
    ).toEqual(["first_frame", "first_last_frame", "reference_image"]);
  });

  it("keeps only video-driven modes for video upstreams", () => {
    expect(
      getAvailableVideoGenerationModes("kling O1", {
        hasImageUpstream: false,
        hasVideoUpstream: true,
      }),
    ).toEqual(["reference_video", "video_edit"]);
  });

  it("treats mixed upstreams as video-driven modes", () => {
    expect(
      getAvailableVideoGenerationModes("wan2.6", {
        hasImageUpstream: true,
        hasVideoUpstream: true,
      }),
    ).toEqual(["reference_video"]);
  });

  it("keeps all non-text modes when an upstream visual edge exists but its media kind is unknown", () => {
    expect(
      getAvailableVideoGenerationModes("kling O1", {
        hasImageUpstream: false,
        hasVideoUpstream: false,
        hasVisualUpstream: true,
      }),
    ).toEqual([
      "first_frame",
      "first_last_frame",
      "reference_image",
      "reference_video",
      "video_edit",
    ]);
  });

  it("normalizes to the first available mode when the stored value is invalid", () => {
    expect(
      normalizeAvailableVideoGenerationMode("viduq2-pro", "text", [
        "reference_video",
      ]),
    ).toBe("reference_video");
  });

  it("counts local media against the current generation mode instead of the model defaults", () => {
    const targetNode = {
      id: "video-node",
      data: {
        type: "DoubaoVideoGenerator",
        node: {
          template: {
            model_name: { value: "VEO3.1" },
            generation_mode: { value: "reference_image" },
            first_frame_image: {
              value: ["image-1", "image-2"],
              file_path: [
                "flow-id/file-1.png",
                "flow-id/file-2.png",
              ],
            },
          },
        },
      },
    } as any;

    expect(getImageRoleCounts([], "video-node", targetNode)).toMatchObject({
      total: 2,
      first: 0,
      reference: 2,
      last: 0,
    });
  });

  it("rejects a last-frame connection unless the mode is first_last_frame", () => {
    const nodes = [
      {
        id: "image-node",
        data: {
          type: "UserUploadImage",
        },
      },
      {
        id: "video-node",
        data: {
          type: "DoubaoVideoGenerator",
          node: {
            template: {
              model_name: { value: "VEO3.1" },
              generation_mode: { value: "first_frame" },
              first_frame_image: {
                input_types: ["Data"],
                type: "file",
                list: true,
              },
              last_frame_image: {
                input_types: ["Data"],
                type: "file",
                list: false,
              },
            },
          },
        },
      },
    ] as any;

    const connection = {
      source: "image-node",
      target: "video-node",
      sourceHandle: JSON.stringify({
        id: "image-node",
        dataType: "UserUploadImage",
        name: "image",
        output_types: ["Data"],
      }),
      targetHandle: JSON.stringify({
        id: "video-node",
        fieldName: "last_frame_image",
        inputTypes: ["Data"],
        type: "file",
      }),
    } as any;

    expect(isValidConnection(connection, nodes, [])).toBe(false);
  });

  it("rejects a video bridge connection unless the mode is video-driven", () => {
    const nodes = [
      {
        id: "video-source",
        data: {
          type: "UserUploadVideo",
        },
      },
      {
        id: "video-node",
        data: {
          type: "DoubaoVideoGenerator",
          node: {
            template: {
              model_name: { value: "wan2.6" },
              generation_mode: { value: "first_frame" },
              first_frame_image: {
                input_types: ["Data"],
                type: "file",
                list: true,
              },
              last_frame_image: {
                input_types: ["Data"],
                type: "file",
                list: false,
              },
            },
          },
        },
      },
    ] as any;

    const connection = {
      source: "video-source",
      target: "video-node",
      sourceHandle: JSON.stringify({
        id: "video-source",
        dataType: "UserUploadVideo",
        name: "video",
        output_types: ["Data"],
      }),
      targetHandle: JSON.stringify({
        id: "video-node",
        fieldName: "first_frame_image",
        inputTypes: ["Data"],
        type: "file",
      }),
    } as any;

    expect(isValidConnection(connection, nodes, [])).toBe(false);
  });

  it("allows the first image connection even when the stored mode is still text", () => {
    const nodes = [
      {
        id: "image-node",
        data: {
          type: "UserUploadImage",
        },
      },
      {
        id: "video-node",
        data: {
          type: "DoubaoVideoGenerator",
          node: {
            template: {
              model_name: { value: "VEO3.1" },
              generation_mode: { value: "text" },
              first_frame_image: {
                input_types: ["Data"],
                type: "file",
                list: true,
              },
              prompt: {
                input_types: ["Message", "Data", "Text"],
                type: "str",
                list: false,
              },
            },
          },
        },
      },
    ] as any;

    const connection = {
      source: "image-node",
      target: "video-node",
      sourceHandle: JSON.stringify({
        id: "image-node",
        dataType: "UserUploadImage",
        name: "image",
        output_types: ["Data"],
      }),
      targetHandle: JSON.stringify({
        id: "video-node",
        fieldName: "first_frame_image",
        inputTypes: ["Data"],
        type: "file",
      }),
    } as any;

    expect(isValidConnection(connection, nodes, [])).toBe(true);
  });

  it("allows the first video connection even when the stored mode is still text", () => {
    const nodes = [
      {
        id: "video-source",
        data: {
          type: "UserUploadVideo",
        },
      },
      {
        id: "video-node",
        data: {
          type: "DoubaoVideoGenerator",
          node: {
            template: {
              model_name: { value: "wan2.6" },
              generation_mode: { value: "text" },
              first_frame_image: {
                input_types: ["Data"],
                type: "file",
                list: true,
              },
            },
          },
        },
      },
    ] as any;

    const connection = {
      source: "video-source",
      target: "video-node",
      sourceHandle: JSON.stringify({
        id: "video-source",
        dataType: "UserUploadVideo",
        name: "video",
        output_types: ["Data"],
      }),
      targetHandle: JSON.stringify({
        id: "video-node",
        fieldName: "first_frame_image",
        inputTypes: ["Data"],
        type: "file",
      }),
    } as any;

    expect(isValidConnection(connection, nodes, [])).toBe(true);
  });

  it("allows a second image edge in first_last_frame mode so it can become the last frame", () => {
    const nodes = [
      {
        id: "image-node-1",
        data: {
          type: "UserUploadImage",
        },
      },
      {
        id: "image-node-2",
        data: {
          type: "UserUploadImage",
        },
      },
      {
        id: "video-node",
        data: {
          type: "DoubaoVideoGenerator",
          node: {
            template: {
              model_name: { value: "VEO3.1" },
              generation_mode: { value: "first_last_frame" },
              first_frame_image: {
                input_types: ["Data"],
                type: "file",
                list: true,
              },
              last_frame_image: {
                input_types: ["Data"],
                type: "file",
                list: false,
              },
            },
          },
        },
      },
    ] as any;

    const firstHandle = JSON.stringify({
      id: "image-node-1",
      dataType: "UserUploadImage",
      name: "image",
      output_types: ["Data"],
    });
    const secondHandle = JSON.stringify({
      id: "image-node-2",
      dataType: "UserUploadImage",
      name: "image",
      output_types: ["Data"],
    });
    const targetHandle = JSON.stringify({
      id: "video-node",
      fieldName: "first_frame_image",
      inputTypes: ["Data"],
      type: "file",
    });
    const edges = [
      {
        id: "edge-first",
        source: "image-node-1",
        target: "video-node",
        sourceHandle: firstHandle,
        targetHandle,
        data: {
          sourceHandle: JSON.parse(firstHandle),
          targetHandle: JSON.parse(targetHandle),
          imageRole: "first",
        },
      },
    ] as any;

    const connection = {
      source: "image-node-2",
      target: "video-node",
      sourceHandle: secondHandle,
      targetHandle,
    } as any;

    expect(isValidConnection(connection, nodes, edges)).toBe(true);
  });

  it("rejects connecting visual media to the hidden prompt handle", () => {
    const nodes = [
      {
        id: "image-node",
        data: {
          type: "UserUploadImage",
        },
      },
      {
        id: "video-node",
        data: {
          type: "DoubaoVideoGenerator",
          node: {
            template: {
              model_name: { value: "VEO3.1" },
              generation_mode: { value: "text" },
              first_frame_image: {
                input_types: ["Data"],
                type: "file",
                list: true,
              },
              prompt: {
                input_types: ["Message", "Data", "Text"],
                type: "str",
                list: false,
              },
            },
          },
        },
      },
    ] as any;

    const connection = {
      source: "image-node",
      target: "video-node",
      sourceHandle: JSON.stringify({
        id: "image-node",
        dataType: "UserUploadImage",
        name: "image",
        output_types: ["Data"],
      }),
      targetHandle: JSON.stringify({
        id: "video-node",
        fieldName: "prompt",
        inputTypes: ["Message", "Data", "Text"],
        type: "str",
      }),
    } as any;

    expect(isValidConnection(connection, nodes, [])).toBe(false);
  });
});
