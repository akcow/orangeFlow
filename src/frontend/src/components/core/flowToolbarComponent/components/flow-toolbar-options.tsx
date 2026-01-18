import PublishDropdown from "./deploy-dropdown";
import type { Dispatch, SetStateAction } from "react";

type FlowToolbarOptionsProps = {
  openApiModal: boolean;
  setOpenApiModal: Dispatch<SetStateAction<boolean>>;
};
const FlowToolbarOptions = ({
  openApiModal,
  setOpenApiModal,
}: FlowToolbarOptionsProps) => {
  return (
    <div className="flex items-center gap-1.5">
      <PublishDropdown
        openApiModal={openApiModal}
        setOpenApiModal={setOpenApiModal}
      />
    </div>
  );
};

export default FlowToolbarOptions;
