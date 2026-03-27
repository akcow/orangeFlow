import fs from "fs";
import path from "path";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

describe("flow utils module boundaries", () => {
  it("keeps reactflowUtils decoupled from flowStore", () => {
    const reactflowUtilsSource = readSource("reactflowUtils.ts");
    expect(reactflowUtilsSource).not.toContain("@/stores/flowStore");
  });

  it("keeps extracted pure helpers free of flowStore imports", () => {
    const flowMediaSource = readSource("flowMediaUtils.ts");
    const flowGraphSource = readSource("flowGraphUtils.ts");

    expect(flowMediaSource).not.toContain("@/stores/flowStore");
    expect(flowGraphSource).not.toContain("@/stores/flowStore");
  });
});
