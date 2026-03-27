import type { AllNodeType, EdgeType } from "@/types/flow";

export function getConnectedSubgraph(
  nodeId: string,
  nodes: AllNodeType[],
  edges: EdgeType[],
  direction: "upstream" | "downstream",
): { nodes: AllNodeType[]; edges: EdgeType[] } {
  const visited = new Set<string>();
  const resultNodes: AllNodeType[] = [];
  const resultEdges: EdgeType[] = [];

  function dfs(currentId: string) {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    const node = nodes.find((candidate) => candidate.id === currentId);
    if (!node) return;

    resultNodes.push(node);
    if (direction === "upstream") {
      const incomingEdges = edges.filter((edge) => edge.target === currentId);
      for (const edge of incomingEdges) {
        resultEdges.push(edge);
        dfs(edge.source);
      }
      return;
    }

    const outgoingEdges = edges.filter((edge) => edge.source === currentId);
    for (const edge of outgoingEdges) {
      resultEdges.push(edge);
      dfs(edge.target);
    }
  }

  dfs(nodeId);
  return {
    nodes: resultNodes,
    edges: resultEdges,
  };
}

export function getLineageHighlightedEdgeIds(
  selectedNodeIds: string[],
  nodes: AllNodeType[],
  edges: EdgeType[],
): string[] {
  if (selectedNodeIds.length === 0) {
    return [];
  }

  const highlightedEdgeIds = new Set<string>();

  for (const nodeId of selectedNodeIds) {
    const upstream = getConnectedSubgraph(nodeId, nodes, edges, "upstream");
    const downstream = getConnectedSubgraph(nodeId, nodes, edges, "downstream");

    upstream.edges.forEach((edge) => highlightedEdgeIds.add(edge.id));
    downstream.edges.forEach((edge) => highlightedEdgeIds.add(edge.id));
  }

  return Array.from(highlightedEdgeIds);
}
