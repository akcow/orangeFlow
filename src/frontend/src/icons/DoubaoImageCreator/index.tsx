import type React from "react";
import { forwardRef } from "react";
import SvgDoubaoImageCreator from "./DoubaoImageCreator";

export const DoubaoImageCreatorIcon = forwardRef<
  SVGSVGElement,
  React.PropsWithChildren<{}>
>((props, ref) => {
  return <SvgDoubaoImageCreator ref={ref} {...props} />;
});

DoubaoImageCreatorIcon.displayName = "DoubaoImageCreatorIcon";
