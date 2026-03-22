import {
  sanitizePreviewDataUrl,
  toRenderableImageSource,
} from "../helpers";

describe("DoubaoPreviewPanel helpers", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test("keeps normal remote image URLs unchanged without fetching", async () => {
    const originalFetch = (globalThis as any).fetch;
    const fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;

    await expect(
      toRenderableImageSource("/api/v1/files/images/flow-1/uploaded-photo.jpg"),
    ).resolves.toEqual({
      url: "/api/v1/files/images/flow-1/uploaded-photo.jpg",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    (globalThis as any).fetch = originalFetch;
  });

  test("sanitizes data URLs and converts them to object URLs", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = jest.fn().mockReturnValue("blob:preview-image");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    const input =
      "data:image/jpeg;base64,\n/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";
    const expectedSanitized =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";

    expect(sanitizePreviewDataUrl(input)).toBe(expectedSanitized);

    const result = await toRenderableImageSource(input);

    expect(result.url).toBe("blob:preview-image");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(typeof result.revoke).toBe("function");

    result.revoke?.();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-image");

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });
});
