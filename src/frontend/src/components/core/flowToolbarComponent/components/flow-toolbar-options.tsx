import PublishDropdown from "./deploy-dropdown";

const FlowToolbarOptions = () => {
  return (
    <div className="flex items-center gap-1.5">
      <PublishDropdown />
    </div>
  );
};

export default FlowToolbarOptions;
