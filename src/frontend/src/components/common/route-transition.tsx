import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";

type RouteTransitionProps = {
  children: ReactNode;
  transitionKey: string;
  className?: string;
  disabled?: boolean;
};

const ANIMATABLE_TAGS = new Set([
  "ARTICLE",
  "ASIDE",
  "DIV",
  "FORM",
  "HEADER",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "SECTION",
  "UL",
]);

function isAnimatableElement(element: Element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (!ANIMATABLE_TAGS.has(element.tagName)) {
    return false;
  }

  if (element.dataset.routeTransitionSkip === "true") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.position === "fixed"
  ) {
    return false;
  }

  return rect.width > 0 && rect.height > 0;
}

function getAnimationTargets(container: HTMLElement) {
  let currentLevel = Array.from(container.children).filter(isAnimatableElement);
  let depth = 0;

  while (
    currentLevel.length <= 1 &&
    currentLevel[0] instanceof HTMLElement &&
    depth < 2
  ) {
    currentLevel = Array.from(currentLevel[0].children).filter(
      isAnimatableElement,
    );
    depth += 1;
  }

  return currentLevel as HTMLElement[];
}

export function RouteTransition({
  children,
  transitionKey,
  className,
  disabled = false,
}: RouteTransitionProps) {
  const reduceMotion = useReducedMotion();
  const scopeRef = useRef<HTMLDivElement>(null);
  const shouldAnimate = !disabled && !reduceMotion;

  useLayoutEffect(() => {
    if (!shouldAnimate) {
      return;
    }

    const scope = scopeRef.current;

    if (!scope) {
      return;
    }

    const targets = getAnimationTargets(scope);

    if (!targets.length) {
      return;
    }

    const cleanupCallbacks: Array<() => void> = [];

    for (const [index, element] of targets.entries()) {
      element.style.opacity = "0";
      element.style.transform = "translate3d(24px, 0, 0)";
      element.style.willChange = "transform, opacity";

      const frameId = window.requestAnimationFrame(() => {
        const animation = element.animate(
          [
            {
              opacity: 0,
              transform: "translate3d(24px, 0, 0)",
            },
            {
              opacity: 1,
              transform: "translate3d(0, 0, 0)",
            },
          ],
          {
            duration: 280,
            delay: Math.min(index * 45, 180),
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "forwards",
          },
        );

        const clearInlineStyles = () => {
          element.style.opacity = "";
          element.style.transform = "";
          element.style.willChange = "";
        };

        animation.onfinish = clearInlineStyles;
        animation.oncancel = clearInlineStyles;

        cleanupCallbacks.push(() => {
          animation.cancel();
        });
      });

      cleanupCallbacks.push(() => {
        window.cancelAnimationFrame(frameId);
        element.style.opacity = "";
        element.style.transform = "";
        element.style.willChange = "";
      });
    }

    return () => {
      for (const cleanup of cleanupCallbacks) {
        cleanup();
      }
    };
  }, [shouldAnimate, transitionKey]);

  return (
    <div ref={scopeRef} className={className}>
      {children}
    </div>
  );
}
