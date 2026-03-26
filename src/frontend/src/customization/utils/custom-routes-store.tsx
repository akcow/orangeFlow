import { Route } from "react-router-dom";
import { CustomNavigate } from "@/customization/components/custom-navigate";

export const CustomRoutesStore = () => {
  return (
    <>
      <Route path="store" element={<CustomNavigate replace to="/store" />} />
    </>
  );
};

export default CustomRoutesStore;
