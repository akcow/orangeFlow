import type React from "react";
import { forwardRef } from "react";
import { AIMLComponent } from "./AI-ML";

export const AIMLIcon = forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  (props, ref) => {
    return <AIMLComponent ref={ref} className={props.className ?? ""} {...props} />;
  },
);
