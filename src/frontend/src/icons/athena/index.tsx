import type React from "react";
import { forwardRef } from "react";
//@ts-ignore
import { AthenaComponent } from "./athena";

export const AthenaIcon = forwardRef<
  SVGSVGElement,
  React.SVGProps<SVGSVGElement>
>((props, ref) => {
  return <AthenaComponent ref={ref} className={props.className ?? ""} {...props} />;
});
