import { act, renderHook } from "@testing-library/react";

// Mock all the complex dependencies
jest.mock("@xyflow/react", () => ({
  addEdge: jest.fn((edge, edges) => [...edges, edge]),
  applyEdgeChanges: jest.fn((changes, edges) => edges),
  applyNodeChanges: jest.fn((changes, nodes) => nodes),
}));

jest.mock("lodash", () => ({
  cloneDeep: jest.fn((obj) => JSON.parse(JSON.stringify(obj))),
  zip: jest.fn(),
}));

jest.mock("@/CustomNodes/helpers/check-code-validity", () => ({
  checkCodeValidity: jest.fn(),
}));

jest.mock("@/constants/alerts_constants", () => ({
  MISSED_ERROR_ALERT: "MISSED_ERROR_ALERT",
}));

jest.mock("@/constants/constants", () => ({
  BROKEN_EDGES_WARNING: "BROKEN_EDGES_WARNING",
}));

jest.mock("@/customization/feature-flags", () => ({
  ENABLE_DATASTAX_LANGFLOW: false,
}));

jest.mock("@/customization/utils/analytics", () => ({
  track: jest.fn(),
  trackDataLoaded: jest.fn(),
  trackFlowBuild: jest.fn(),
}));

const mockCancelMutateTemplateDebounce = jest.fn();

jest.mock("@/CustomNodes/helpers/mutate-template", () => ({
  cancelMutateTemplateDebounce: mockCancelMutateTemplateDebounce,
}));

// Mock all store dependencies
jest.mock("../alertStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      setErrorData: jest.fn(),
      setSuccessData: jest.fn(),
    }),
  },
}));

jest.mock("../darkStore", () => ({
  useDarkStore: {
    getState: () => ({
      refreshVersion: jest.fn(),
    }),
  },
}));

jest.mock("../flowsManagerStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      setCurrentFlow: jest.fn(),
      takeSnapshot: jest.fn(),
    }),
  },
}));

jest.mock("../globalVariablesStore/globalVariables", () => ({
  useGlobalVariablesStore: {
    getState: () => ({
      globalVariables: {},
    }),
  },
}));

jest.mock("../tweaksStore", () => ({
  useTweaksStore: {
    getState: () => ({
      tweaks: {},
    }),
  },
}));

jest.mock("../typesStore", () => ({
  useTypesStore: {
    getState: () => ({
      templates: {},
      types: {},
    }),
  },
}));

// Mock utility functions
jest.mock("@/utils/utils", () => ({
  brokenEdgeMessage: jest.fn(),
}));

// Note: Some utility modules may not exist in test environment
// The store should handle missing utilities gracefully

import type { AllNodeType, EdgeType } from "@/types/flow";
import useFlowStore from "../flowStore";

describe("useFlowStore", () => {
  // Mock data
  const mockNode: AllNodeType = {
    id: "node-1",
    type: "genericNode",
    position: { x: 100, y: 100 },
    data: {
      id: "node-1",
      type: "TestNode",
      node: {
        display_name: "Test Node",
        icon: "test-icon",
      },
    },
  } as AllNodeType;

  const mockEdge: EdgeType = {
    id: "edge-1",
    source: "node-1",
    target: "node-2",
  } as EdgeType;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    mockCancelMutateTemplateDebounce.mockClear();

    // Reset store state to basics
    act(() => {
      useFlowStore.setState({
        playgroundPage: false,
        positionDictionary: {},
        componentsToUpdate: [],
        onFlowPage: false,
        flowState: undefined,
        flowBuildStatus: {},
        nodes: [],
        edges: [],
        isBuilding: false,
        buildingCount: 0,
        buildControllers: [],
        buildChains: {},
        activeBuildChainsByNode: {},
        isPending: true,
        reactFlowInstance: null,
        lastCopiedSelection: null,
        flowPool: {},
        inputs: [],
        outputs: [],
        hasIO: false,
      });
    });
  });

  describe("initial state", () => {
    it("should initialize with correct default values", () => {
      const { result } = renderHook(() => useFlowStore());

      expect(result.current.playgroundPage).toBe(false);
      expect(result.current.positionDictionary).toEqual({});
      expect(result.current.componentsToUpdate).toEqual([]);
      expect(result.current.onFlowPage).toBe(false);
      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
      expect(result.current.isBuilding).toBe(false);
      expect(result.current.isPending).toBe(true);
      expect(result.current.inputs).toEqual([]);
      expect(result.current.outputs).toEqual([]);
      expect(result.current.hasIO).toBe(false);
    });
  });

  describe("playground page management", () => {
    it("should set playground page state", () => {
      const { result } = renderHook(() => useFlowStore());

      act(() => {
        result.current.setPlaygroundPage(true);
      });

      expect(result.current.playgroundPage).toBe(true);

      act(() => {
        result.current.setPlaygroundPage(false);
      });

      expect(result.current.playgroundPage).toBe(false);
    });
  });

  describe("position dictionary management", () => {
    it("should set position dictionary", () => {
      const { result } = renderHook(() => useFlowStore());
      const mockDict = { 100: 200, 300: 400 };

      act(() => {
        result.current.setPositionDictionary(mockDict);
      });

      expect(result.current.positionDictionary).toEqual(mockDict);
    });

    it("should check if position is available", () => {
      const { result } = renderHook(() => useFlowStore());

      // Set a position in dictionary
      act(() => {
        result.current.setPositionDictionary({ 100: 200 });
      });

      // Position should not be available if it exists in dictionary
      expect(result.current.isPositionAvailable({ x: 100, y: 200 })).toBe(
        false,
      );

      // Position should be available if it doesn't exist
      expect(result.current.isPositionAvailable({ x: 150, y: 250 })).toBe(true);
    });
  });

  describe("flow page management", () => {
    it("should set on flow page state", () => {
      const { result } = renderHook(() => useFlowStore());

      act(() => {
        result.current.setOnFlowPage(true);
      });

      expect(result.current.onFlowPage).toBe(true);

      act(() => {
        result.current.setOnFlowPage(false);
      });

      expect(result.current.onFlowPage).toBe(false);
    });
  });

  describe("components to update management", () => {
    it("should set components to update with array", () => {
      const { result } = renderHook(() => useFlowStore());
      const mockComponents = [
        {
          id: "comp-1",
          icon: "icon-1",
          display_name: "Component 1",
          outdated: true,
          breakingChange: false,
          userEdited: true,
        },
      ];

      act(() => {
        result.current.setComponentsToUpdate(mockComponents);
      });

      expect(result.current.componentsToUpdate).toEqual(mockComponents);
    });

    it("should set components to update with function", () => {
      const { result } = renderHook(() => useFlowStore());
      const initialComponents = [
        {
          id: "comp-1",
          icon: "icon-1",
          display_name: "Component 1",
          outdated: true,
          breakingChange: false,
          userEdited: true,
        },
      ];

      // Set initial state
      act(() => {
        result.current.setComponentsToUpdate(initialComponents);
      });

      // Update with function
      act(() => {
        result.current.setComponentsToUpdate((prev) => [
          ...prev,
          {
            id: "comp-2",
            icon: "icon-2",
            display_name: "Component 2",
            outdated: false,
            breakingChange: true,
            userEdited: false,
          },
        ]);
      });

      expect(result.current.componentsToUpdate).toHaveLength(2);
    });
  });

  describe("inputs and outputs management", () => {
    it("should set inputs", () => {
      const { result } = renderHook(() => useFlowStore());
      const mockInputs = [{ id: "input1", type: "text", displayName: "input1" }];

      act(() => {
        result.current.setInputs(mockInputs);
      });

      expect(result.current.inputs).toEqual(mockInputs);
    });

    it("should set outputs", () => {
      const { result } = renderHook(() => useFlowStore());
      const mockOutputs = [{ id: "output1", type: "text", displayName: "output1" }];

      act(() => {
        result.current.setOutputs(mockOutputs);
      });

      expect(result.current.outputs).toEqual(mockOutputs);
    });

    it("should set hasIO state", () => {
      const { result } = renderHook(() => useFlowStore());

      act(() => {
        result.current.setHasIO(true);
      });

      expect(result.current.hasIO).toBe(true);

      act(() => {
        result.current.setHasIO(false);
      });

      expect(result.current.hasIO).toBe(false);
    });
  });

  describe("flow pool management", () => {
    it("should set flow pool", () => {
      const { result } = renderHook(() => useFlowStore());
      const mockFlowPool = { flow1: [{ id: "flow1", data: {} }] } as any;

      act(() => {
        result.current.setFlowPool(mockFlowPool);
      });

      expect(result.current.flowPool).toEqual(mockFlowPool);
    });
  });

  describe("build management", () => {
    it("should handle building state", () => {
      const { result } = renderHook(() => useFlowStore());

      // Test that isBuilding can be read (setter is internal)
      expect(result.current.isBuilding).toBe(false);
    });

    it("should keep isBuilding true until all parallel builds finish", () => {
      const { result } = renderHook(() => useFlowStore());

      act(() => {
        result.current.beginBuilding();
        result.current.beginBuilding();
      });

      expect(result.current.isBuilding).toBe(true);
      expect(result.current.buildingCount).toBe(2);

      act(() => {
        result.current.endBuilding();
      });

      expect(result.current.isBuilding).toBe(true);
      expect(result.current.buildingCount).toBe(1);

      act(() => {
        result.current.endBuilding();
      });

      expect(result.current.isBuilding).toBe(false);
      expect(result.current.buildingCount).toBe(0);
    });

    it("should handle stop building", () => {
      const { result } = renderHook(() => useFlowStore());

      // Mock active build controllers
      const mockAbort = jest.fn();
      act(() => {
        useFlowStore.setState({
          buildControllers: [
            { abort: mockAbort } as unknown as AbortController,
          ],
          buildingCount: 1,
          isBuilding: true,
          updateEdgesRunningByNodes: jest.fn(),
          revertBuiltStatusFromBuilding: jest.fn(),
          nodes: [mockNode],
        });
      });

      act(() => {
        result.current.stopBuilding();
      });

      expect(mockAbort).toHaveBeenCalled();
      expect(result.current.isBuilding).toBe(false);
    });

    it("should stop only the latest chain for a node", () => {
      const { result } = renderHook(() => useFlowStore());

      const abortA = jest.fn();
      const abortB = jest.fn();

      act(() => {
        useFlowStore.setState({
          buildChains: {
            chainA: { controller: { abort: abortA } as any, nodes: {} },
            chainB: { controller: { abort: abortB } as any, nodes: {} },
          },
          activeBuildChainsByNode: {
            "node-1": ["chainA", "chainB"],
          },
        } as any);
      });

      act(() => {
        result.current.stopLatestChainForNode("node-1");
      });

      expect(abortA).not.toHaveBeenCalled();
      expect(abortB).toHaveBeenCalled();
    });
  });

  describe("reactflow integration", () => {
    it("should handle nodes change", () => {
      const { result } = renderHook(() => useFlowStore());
      const mockChanges = [{ id: "node-1", type: "position" as const }];

      act(() => {
        result.current.onNodesChange(mockChanges);
      });

      // Verify that applyNodeChanges would be called
      expect(result.current.nodes).toBeDefined();
    });

    it("should handle edges change", () => {
      const { result } = renderHook(() => useFlowStore());
      const mockChanges = [{ id: "edge-1", type: "remove" as const }];

      act(() => {
        result.current.onEdgesChange(mockChanges);
      });

      // Verify that applyEdgeChanges would be called
      expect(result.current.edges).toBeDefined();
    });

    it("should handle fitViewNode when reactFlowInstance exists", () => {
      const { result } = renderHook(() => useFlowStore());
      const mockFitView = jest.fn();

      act(() => {
        useFlowStore.setState({
          reactFlowInstance: { fitView: mockFitView } as any,
          nodes: [mockNode],
        });
      });

      act(() => {
        result.current.fitViewNode("node-1");
      });

      expect(mockFitView).toHaveBeenCalledWith({ nodes: [{ id: "node-1" }] });
    });

    it("should not call fitView when reactFlowInstance is null", () => {
      const { result } = renderHook(() => useFlowStore());

      // Should not throw when reactFlowInstance is null
      expect(() => {
        act(() => {
          result.current.fitViewNode("node-1");
        });
      }).not.toThrow();
    });
  });

  describe("tool mode management", () => {
    it("should handle updateToolMode method existence", () => {
      const { result } = renderHook(() => useFlowStore());

      // Just verify the method exists
      expect(typeof result.current.updateToolMode).toBe("function");
    });
  });

  describe("node updates", () => {
    it("should ignore setNode when the node no longer exists", () => {
      const { result } = renderHook(() => useFlowStore());

      act(() => {
        useFlowStore.setState({ nodes: [mockNode] });
      });

      expect(() => {
        act(() => {
          result.current.setNode("missing-node", mockNode);
        });
      }).not.toThrow();

      expect(result.current.nodes).toEqual([mockNode]);
    });

    it("should cancel pending template mutations when deleting nodes", () => {
      const { result } = renderHook(() => useFlowStore());

      act(() => {
        useFlowStore.setState({ nodes: [mockNode] });
      });

      act(() => {
        result.current.deleteNode("node-1");
      });

      expect(mockCancelMutateTemplateDebounce).toHaveBeenCalledWith("node-1");
      expect(result.current.nodes).toEqual([]);
    });
  });

  describe("edge connection metadata", () => {
    it("should stamp new connections with connectedAt metadata", () => {
      const { result } = renderHook(() => useFlowStore());

      const sourceHandle = JSON.stringify({
        id: "node-1",
        dataType: "UserUploadImage",
        name: "image",
        output_types: ["Data"],
      });
      const targetHandle = JSON.stringify({
        id: "node-2",
        fieldName: "reference_images",
        inputTypes: ["Data"],
        type: "file",
      });

      act(() => {
        useFlowStore.setState({
          nodes: [
            {
              ...mockNode,
              data: {
                ...mockNode.data,
                type: "UserUploadImage",
              },
            } as AllNodeType,
            {
              id: "node-2",
              type: "genericNode",
              position: { x: 300, y: 100 },
              data: {
                id: "node-2",
                type: "DoubaoImageCreator",
                node: {
                  display_name: "Image Creator",
                  template: {
                    reference_images: {
                      input_types: ["Data"],
                      type: "file",
                    },
                  },
                },
              },
            } as AllNodeType,
          ],
        });
      });

      act(() => {
        result.current.onConnect({
          source: "node-1",
          target: "node-2",
          sourceHandle,
          targetHandle,
        } as any);
      });

      expect(result.current.edges).toHaveLength(1);
      expect(typeof result.current.edges[0]?.data?.connectedAt).toBe("number");
    });

    it("blocks a second image edge in first-frame mode", () => {
      const { result } = renderHook(() => useFlowStore());

      const targetHandle = JSON.stringify({
        id: "video-node",
        fieldName: "first_frame_image",
        inputTypes: ["Data"],
        type: "file",
      });
      const sourceHandleOne = JSON.stringify({
        id: "image-node-1",
        dataType: "UserUploadImage",
        name: "image",
        output_types: ["Data"],
      });
      const sourceHandleTwo = JSON.stringify({
        id: "image-node-2",
        dataType: "UserUploadImage",
        name: "image",
        output_types: ["Data"],
      });

      act(() => {
        useFlowStore.setState({
          nodes: [
            {
              id: "image-node-1",
              type: "genericNode",
              position: { x: 0, y: 0 },
              data: {
                id: "image-node-1",
                type: "UserUploadImage",
                node: {
                  template: {
                    file: {
                      value: "image-1.png",
                      file_path: "flow-id/image-1.png",
                    },
                  },
                },
              },
            } as AllNodeType,
            {
              id: "image-node-2",
              type: "genericNode",
              position: { x: 0, y: 120 },
              data: {
                id: "image-node-2",
                type: "UserUploadImage",
                node: {
                  template: {
                    file: {
                      value: "image-2.png",
                      file_path: "flow-id/image-2.png",
                    },
                  },
                },
              },
            } as AllNodeType,
            {
              id: "video-node",
              type: "genericNode",
              position: { x: 300, y: 100 },
              data: {
                id: "video-node",
                type: "DoubaoVideoGenerator",
                node: {
                  display_name: "Video Creator",
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
            } as AllNodeType,
          ],
          edges: [
            {
              id: "edge-first",
              source: "image-node-1",
              target: "video-node",
              sourceHandle: sourceHandleOne,
              targetHandle,
              data: {
                sourceHandle: JSON.parse(sourceHandleOne),
                targetHandle: JSON.parse(targetHandle),
                imageRole: "first",
                connectedAt: Date.now(),
              },
            } as EdgeType,
          ],
        });
      });

      act(() => {
        result.current.onConnect({
          source: "image-node-2",
          target: "video-node",
          sourceHandle: sourceHandleTwo,
          targetHandle,
        } as any);
      });

      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0]?.source).toBe("image-node-1");
    });

    it("reroutes a visual upstream dropped onto prompt back to first_frame_image", () => {
      const { result } = renderHook(() => useFlowStore());

      const sourceHandle = JSON.stringify({
        id: "image-node",
        dataType: "UserUploadImage",
        name: "image",
        output_types: ["Data"],
      });
      const promptHandle = JSON.stringify({
        id: "video-node",
        fieldName: "prompt",
        inputTypes: ["Message", "Data", "Text"],
        type: "str",
      });

      act(() => {
        useFlowStore.setState({
          nodes: [
            {
              id: "image-node",
              type: "genericNode",
              position: { x: 0, y: 0 },
              data: {
                id: "image-node",
                type: "UserUploadImage",
                node: {
                  template: {
                    file: {
                      value: "image-1.png",
                      file_path: "flow-id/image-1.png",
                    },
                  },
                },
              },
            } as AllNodeType,
            {
              id: "video-node",
              type: "genericNode",
              position: { x: 300, y: 100 },
              data: {
                id: "video-node",
                type: "DoubaoVideoGenerator",
                node: {
                  display_name: "Video Creator",
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
            } as AllNodeType,
          ],
        });
      });

      act(() => {
        result.current.onConnect({
          source: "image-node",
          target: "video-node",
          sourceHandle,
          targetHandle: promptHandle,
        } as any);
      });

      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0]?.data?.targetHandle?.fieldName).toBe("first_frame_image");
    });

    it("accepts the first upstream video even when the stored mode is still text", () => {
      const { result } = renderHook(() => useFlowStore());

      const sourceHandle = JSON.stringify({
        id: "video-source",
        dataType: "UserUploadVideo",
        name: "video",
        output_types: ["Data"],
      });
      const targetHandle = JSON.stringify({
        id: "video-node",
        fieldName: "first_frame_image",
        inputTypes: ["Data"],
        type: "file",
      });

      act(() => {
        useFlowStore.setState({
          nodes: [
            {
              id: "video-source",
              type: "genericNode",
              position: { x: 0, y: 0 },
              data: {
                id: "video-source",
                type: "UserUploadVideo",
                node: {
                  template: {
                    file: {
                      value: "video-1.mp4",
                      file_path: "flow-id/video-1.mp4",
                    },
                  },
                },
              },
            } as AllNodeType,
            {
              id: "video-node",
              type: "genericNode",
              position: { x: 300, y: 100 },
              data: {
                id: "video-node",
                type: "DoubaoVideoGenerator",
                node: {
                  display_name: "Video Creator",
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
            } as AllNodeType,
          ],
        });
      });

      act(() => {
        result.current.onConnect({
          source: "video-source",
          target: "video-node",
          sourceHandle,
          targetHandle,
        } as any);
      });

      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0]?.data?.videoReferType).toBe("feature");
    });

    it("assigns the second image as the last frame in first_last_frame mode", () => {
      const { result } = renderHook(() => useFlowStore());

      const targetHandle = JSON.stringify({
        id: "video-node",
        fieldName: "first_frame_image",
        inputTypes: ["Data"],
        type: "file",
      });
      const sourceHandleOne = JSON.stringify({
        id: "image-node-1",
        dataType: "UserUploadImage",
        name: "image",
        output_types: ["Data"],
      });
      const sourceHandleTwo = JSON.stringify({
        id: "image-node-2",
        dataType: "UserUploadImage",
        name: "image",
        output_types: ["Data"],
      });

      act(() => {
        useFlowStore.setState({
          nodes: [
            {
              id: "image-node-1",
              type: "genericNode",
              position: { x: 0, y: 0 },
              data: {
                id: "image-node-1",
                type: "UserUploadImage",
                node: {
                  template: {
                    file: {
                      value: "image-1.png",
                      file_path: "flow-id/image-1.png",
                    },
                  },
                },
              },
            } as AllNodeType,
            {
              id: "image-node-2",
              type: "genericNode",
              position: { x: 0, y: 120 },
              data: {
                id: "image-node-2",
                type: "UserUploadImage",
                node: {
                  template: {
                    file: {
                      value: "image-2.png",
                      file_path: "flow-id/image-2.png",
                    },
                  },
                },
              },
            } as AllNodeType,
            {
              id: "video-node",
              type: "genericNode",
              position: { x: 300, y: 100 },
              data: {
                id: "video-node",
                type: "DoubaoVideoGenerator",
                node: {
                  display_name: "Video Creator",
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
            } as AllNodeType,
          ],
          edges: [
            {
              id: "edge-first",
              source: "image-node-1",
              target: "video-node",
              sourceHandle: sourceHandleOne,
              targetHandle,
              data: {
                sourceHandle: JSON.parse(sourceHandleOne),
                targetHandle: JSON.parse(targetHandle),
                imageRole: "first",
                connectedAt: Date.now(),
              },
            } as EdgeType,
          ],
        });
      });

      act(() => {
        result.current.onConnect({
          source: "image-node-2",
          target: "video-node",
          sourceHandle: sourceHandleTwo,
          targetHandle,
        } as any);
      });

      expect(result.current.edges).toHaveLength(2);
      expect(result.current.edges[1]?.data?.imageRole).toBe("last");
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete flow setup workflow", () => {
      const { result } = renderHook(() => useFlowStore());

      // Set up basic flow page
      act(() => {
        result.current.setOnFlowPage(true);
        result.current.setPlaygroundPage(false);
      });

      // Configure positions
      act(() => {
        result.current.setPositionDictionary({ 100: 200 });
      });

      // Set up inputs/outputs
      act(() => {
        result.current.setInputs([
          { id: "input1", type: "text", displayName: "input1" },
        ]);
        result.current.setOutputs([
          { id: "output1", type: "text", displayName: "output1" },
        ]);
        result.current.setHasIO(true);
      });

      expect(result.current.onFlowPage).toBe(true);
      expect(result.current.playgroundPage).toBe(false);
      expect(result.current.positionDictionary).toEqual({ 100: 200 });
      expect(result.current.inputs).toHaveLength(1);
      expect(result.current.outputs).toHaveLength(1);
      expect(result.current.hasIO).toBe(true);
    });

    it("should handle state transitions correctly", () => {
      const { result } = renderHook(() => useFlowStore());

      // Start with playground
      act(() => {
        result.current.setPlaygroundPage(true);
        result.current.setOnFlowPage(false);
      });

      expect(result.current.playgroundPage).toBe(true);
      expect(result.current.onFlowPage).toBe(false);

      // Switch to flow page
      act(() => {
        result.current.setPlaygroundPage(false);
        result.current.setOnFlowPage(true);
      });

      expect(result.current.playgroundPage).toBe(false);
      expect(result.current.onFlowPage).toBe(true);
    });
  });

  describe("error handling and edge cases", () => {
    it("should handle empty position dictionary checks", () => {
      const { result } = renderHook(() => useFlowStore());

      // Should return true for any position when dictionary is empty
      expect(result.current.isPositionAvailable({ x: 100, y: 200 })).toBe(true);
    });

    it("should handle undefined/null values gracefully", () => {
      const { result } = renderHook(() => useFlowStore());

      act(() => {
        result.current.setInputs([]);
        result.current.setOutputs([]);
        result.current.setFlowPool({});
      });

      expect(result.current.inputs).toEqual([]);
      expect(result.current.outputs).toEqual([]);
      expect(result.current.flowPool).toEqual({});
    });

    it("should handle rapid state changes", () => {
      const { result } = renderHook(() => useFlowStore());

      act(() => {
        result.current.setPlaygroundPage(true);
        result.current.setPlaygroundPage(false);
        result.current.setOnFlowPage(true);
        result.current.setOnFlowPage(false);
        result.current.setHasIO(true);
        result.current.setHasIO(false);
      });

      expect(result.current.playgroundPage).toBe(false);
      expect(result.current.onFlowPage).toBe(false);
      expect(result.current.hasIO).toBe(false);
    });
  });

  describe("complex state management", () => {
    it("should maintain state consistency during concurrent operations", () => {
      const { result } = renderHook(() => useFlowStore());

      act(() => {
        // Simulate concurrent operations
        result.current.setPlaygroundPage(true);
        result.current.setPositionDictionary({ 10: 20, 30: 40 });
        result.current.setComponentsToUpdate([]);
        result.current.setInputs([
          {
            id: "concurrent-input",
            type: "text",
            displayName: "concurrent-input",
          },
        ]);
        result.current.setOutputs([
          {
            id: "concurrent-output",
            type: "text",
            displayName: "concurrent-output",
          },
        ]);
        result.current.setHasIO(true);
      });

      expect(result.current.playgroundPage).toBe(true);
      expect(result.current.positionDictionary).toEqual({ 10: 20, 30: 40 });
      expect(result.current.componentsToUpdate).toEqual([]);
      expect(result.current.inputs).toHaveLength(1);
      expect(result.current.outputs).toHaveLength(1);
      expect(result.current.hasIO).toBe(true);
    });
  });
});
