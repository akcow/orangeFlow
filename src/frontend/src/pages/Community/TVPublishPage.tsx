import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import TVPublishForm from "./TVPublishForm";

export default function TVPublishPage() {
  const navigate = useCustomNavigate();
  const [params] = useSearchParams();
  const currentFlowId = useFlowsManagerStore((s) => s.currentFlow?.id);

  const flowId = useMemo(() => {
    const q = params.get("flow_id");
    return q || currentFlowId || "";
  }, [currentFlowId, params]);

  const close = () => navigate("/community/tv");

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-auto bg-background/80 p-6 backdrop-blur">
      {flowId ? <TVPublishForm flowId={flowId} onClose={close} /> : null}
    </div>
  );
}
