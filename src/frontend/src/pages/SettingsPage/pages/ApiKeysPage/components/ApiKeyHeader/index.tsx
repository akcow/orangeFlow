import ForwardedIconComponent from "../../../../../../components/common/genericIconComponent";
import { Button } from "../../../../../../components/ui/button";
import { API_PAGE_PARAGRAPH } from "../../../../../../constants/constants";
import SecretKeyModal from "../../../../../../modals/secretKeyModal";
import { t } from "@/i18n/t";
import { getModalPropsApiKey } from "../../helpers/get-modal-props";

type ApiKeyHeaderComponentProps = {
  selectedRows: string[];
  fetchApiKeys: () => void;
  userId: string;
};
const ApiKeyHeaderComponent = ({
  selectedRows,
  fetchApiKeys,
  userId,
}: ApiKeyHeaderComponentProps) => {
  const modalProps = getModalPropsApiKey();
  return (
    <>
      <div className="flex w-full items-start justify-between gap-6">
        <div className="flex w-full flex-col">
          <h2
            className="flex items-center text-lg font-semibold tracking-tight"
            data-testid="settings_menu_header"
          >
            API Keys
            <ForwardedIconComponent
              name="Key"
              className="ml-2 h-5 w-5 text-primary"
            />
          </h2>
          <p className="text-sm text-muted-foreground">管理用于访问 Langflow 和托管网关服务的 API 密钥。</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <SecretKeyModal
            modalProps={modalProps}
            data={userId}
            onCloseModal={fetchApiKeys}
          >
            <Button data-testid="api-key-button-store" variant="primary">
              <ForwardedIconComponent name="Plus" className="w-4" />
              新建 API Key
            </Button>
          </SecretKeyModal>
        </div>
      </div>
      <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary/80">
        <h4 className="flex items-center gap-2 font-medium">
          <ForwardedIconComponent name="Network" className="h-4 w-4" />
          托管网关访问 (Hosted Gateway)
        </h4>
        <p className="mt-1">
          这些 API Key 均可直接作为 "Hosted Gateway Key" 使用，通过统一网关接口访问所有支持的 AI 模型（OpenAI, DeepSeek, Google Gemini, ByteDance Doubao 等）。
          <br />
          <strong>Base URL:</strong> <code>{window.location.origin}/v1</code>
        </p>
      </div>
    </>
  );
};
export default ApiKeyHeaderComponent;
