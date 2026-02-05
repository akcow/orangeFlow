import { render, screen } from "@testing-library/react";
import CanvasMiniMap from "../CanvasMiniMap";
import { useCanvasUiStore } from "@/stores/canvasUiStore";

let isMobile = false;

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => isMobile,
}));

jest.mock("@xyflow/react", () => ({
  MiniMap: (props: any) => (
    <div
      data-testid="minimap"
      data-position={props.position}
      data-pannable={String(props.pannable)}
      data-zoomable={String(props.zoomable)}
      style={props.style}
      className={props.className}
    />
  ),
}));

describe("CanvasMiniMap", () => {
  beforeEach(() => {
    isMobile = false;
    useCanvasUiStore.setState({ miniMapOpen: false });
  });

  it("renders nothing when closed", () => {
    render(<CanvasMiniMap />);
    expect(screen.queryByTestId("minimap")).not.toBeInTheDocument();
  });

  it("renders minimap when opened", () => {
    useCanvasUiStore.setState({ miniMapOpen: true });
    render(<CanvasMiniMap />);
    const minimap = screen.getByTestId("minimap");

    // BASE(8) + BAR(40) + GAP(8) = 56
    expect(minimap.style.bottom).toBe("56px");
  });

  it("does not render on mobile", () => {
    isMobile = true;
    useCanvasUiStore.setState({ miniMapOpen: true });
    render(<CanvasMiniMap />);

    expect(screen.queryByTestId("minimap")).not.toBeInTheDocument();
  });
});
