import {
  getAvailableVideoGenerationModes,
  normalizeAvailableVideoGenerationMode,
} from "../flowMediaUtils";
import { getLineageHighlightedEdgeIds } from "../flowGraphUtils";

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

  it("normalizes to the first available mode when the stored value is invalid", () => {
    expect(
      normalizeAvailableVideoGenerationMode("viduq2-pro", "text", [
        "reference_video",
      ]),
    ).toBe("reference_video");
  });
});
