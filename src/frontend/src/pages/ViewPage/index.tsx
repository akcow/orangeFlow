import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/controllers/API/api";
import { useGetFlow } from "@/controllers/API/queries/flows/use-get-flow";
import { useGetTypes } from "@/controllers/API/queries/flows/use-get-types";
import { getURL } from "@/controllers/API/helpers/constants";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import { useTypesStore } from "@/stores/typesStore";
import type { FlowType } from "@/types/flow";
import { processDataFromFlow } from "@/utils/reactflowUtils";
import useFlowsManagerStore from "../../stores/flowsManagerStore";
import Page from "../FlowPage/components/PageComponent";

export default function ViewPage({
  publicPreview = false,
}: {
  publicPreview?: boolean;
}) {
  const setCurrentFlow = useFlowsManagerStore((state) => state.setCurrentFlow);

  const { id } = useParams();
  const navigate = useCustomNavigate();
  const { mutateAsync: getFlow } = useGetFlow();

  const flows = useFlowsManagerStore((state) => state.flows);
  const types = useTypesStore((state) => state.types);
  const publicLoadedFlowIdRef = useRef<string | null>(null);
  const publicLoadingFlowIdRef = useRef<string | null>(null);
  const publicFailedFlowIdRef = useRef<string | null>(null);

  useGetTypes({
    enabled: Object.keys(types).length <= 0,
    checkCache: true,
  });

  useEffect(() => {
    if (!publicPreview || !id) return;
    if (
      publicLoadedFlowIdRef.current === id ||
      publicLoadingFlowIdRef.current === id ||
      publicFailedFlowIdRef.current === id
    ) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    publicLoadingFlowIdRef.current = id;

    const loadPublicFlow = async () => {
      try {
        const response = await api.get(getURL("PUBLIC_FLOW", { flowId: id }), {
          signal: abortController.signal,
        });
        const flow = response.data as FlowType;
        if (!flow) {
          throw new Error("Public flow payload is empty");
        }
        if (flow.data) {
          await processDataFromFlow(flow, false).catch(() => null);
        }
        if (!flow.data?.nodes?.length) {
          throw new Error("Public flow has no nodes");
        }
        if (!cancelled) {
          setCurrentFlow(flow);
          publicLoadedFlowIdRef.current = id;
          publicFailedFlowIdRef.current = null;
        }
      } catch (error: any) {
        if (cancelled || error?.code === "ERR_CANCELED") return;
        publicFailedFlowIdRef.current = id;
        navigate("/community/tv");
      } finally {
        if (!cancelled && publicLoadingFlowIdRef.current === id) {
          publicLoadingFlowIdRef.current = null;
        }
      }
    };

    void loadPublicFlow();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [id, publicPreview, navigate, setCurrentFlow]);

  // Set flow tab id
  useEffect(() => {
    if (!id || publicPreview) return;
    let cancelled = false;
    const fallbackPath = "/all";

    const load = async () => {
      try {
        const existingFlow = flows?.find((flow) => flow.id === id);
        if (existingFlow?.data) {
          if (!cancelled) {
            setCurrentFlow(existingFlow);
          }
          return;
        }
        if (!flows) {
          // Wait until private flow list is available before deciding if we should redirect.
          return;
        }
        if (existingFlow) {
          const fullFlow = await getFlow({ id, public: false });
          if (!cancelled) {
            setCurrentFlow(fullFlow);
          }
          return;
        }
        if (!cancelled) {
          navigate(fallbackPath);
        }
      } catch {
        if (!cancelled) {
          navigate(fallbackPath);
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [id, flows, publicPreview, getFlow, navigate, setCurrentFlow]);

  return (
    <div className="flow-page-positioning">
      <Page view setIsLoading={() => {}} />
    </div>
  );
}
