import { forwardRef, type SVGProps } from "react";
import { cn } from "@/utils/utils";

type Props = SVGProps<SVGSVGElement> & {
  isDark?: boolean;
};

export const HDIcon = forwardRef<SVGSVGElement, Props>(function HDIcon(
  { className, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      {...props}
    >
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 15.75V8.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M11 15.75V8.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 12H11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14 8.25H16.2C17.35 8.25 18.25 9.15 18.25 10.3V13.7C18.25 14.85 17.35 15.75 16.2 15.75H14V8.25Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
});
