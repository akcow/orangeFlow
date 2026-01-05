import type React from "react";
import { forwardRef } from "react";
import SvgFreezeAll from "./freezeAll";

export const freezeAllIcon = forwardRef<
  SVGSVGElement,
  React.SVGProps<SVGSVGElement>
>((props, ref) => {
  return <SvgFreezeAll ref={ref} className={props.className ?? ""} {...props} />;
});
