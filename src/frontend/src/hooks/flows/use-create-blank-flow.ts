import { useParams } from "react-router-dom";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import { track } from "@/customization/utils/analytics";
import useAddFlow from "@/hooks/flows/use-add-flow";

export default function useCreateBlankFlow() {
  const addFlow = useAddFlow();
  const navigate = useCustomNavigate();
  const { folderId } = useParams();

  return async () => {
    const id = await addFlow();
    track("New Flow Created", { template: "Blank Flow" });
    navigate(`/flow/${id}${folderId ? `/folder/${folderId}` : ""}`);
    return id;
  };
}
