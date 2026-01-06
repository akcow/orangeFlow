import useAddFlow from "@/hooks/flows/use-add-flow";
import { getComponent } from "../../../../controllers/API";
import { t } from "@/i18n/t";
import type { storeComponent } from "../../../../types/store";
import cloneFlowWithParent from "../../../../utils/storeUtils";

const useInstallComponent = (
  data: storeComponent,
  name: string,
  downloadsCount: number,
  setDownloadsCount: (value: any) => void,
  setLoading: (value: boolean) => void,
  setSuccessData: (value: { title: string }) => void,
  setErrorData: (value: { title: string; list: string[] }) => void,
) => {
  const addFlow = useAddFlow();

  const handleInstall = () => {
    const temp = downloadsCount;
    setDownloadsCount((old) => Number(old) + 1);
    setLoading(true);

    getComponent(data.id)
      .then((res) => {
        const newFlow = cloneFlowWithParent(res, res.id, data.is_component);
        addFlow({ flow: newFlow })
          .then((id) => {
            setSuccessData({
              title: t("{{name}} installed successfully.", { name }),
            });
            setLoading(false);
          })
          .catch((error) => {
            setLoading(false);
            setErrorData({
              title: t("Error installing the {{name}}", { name }),
              list: [error.response.data.detail],
            });
          });
      })
      .catch((err) => {
        setLoading(false);
        setErrorData({
          title: t("Error installing the {{name}}", { name }),
          list: [err.response.data.detail],
        });
        setDownloadsCount(temp);
      });
  };

  return { handleInstall };
};

export default useInstallComponent;
