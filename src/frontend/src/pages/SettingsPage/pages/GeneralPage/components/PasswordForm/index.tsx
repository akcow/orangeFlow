import * as Form from "@radix-ui/react-form";
import { t } from "@/i18n/t";
import InputComponent from "../../../../../../components/core/parameterRenderComponent/components/inputComponent";
import { Button } from "../../../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../../../../components/ui/card";

type PasswordFormComponentProps = {
  currentPassword: string;
  password: string;
  cnfPassword: string;
  handleInput: (event: any) => void;
  handlePatchPassword: () => void;
};
const PasswordFormComponent = ({
  currentPassword,
  password,
  cnfPassword,
  handleInput,
  handlePatchPassword,
}: PasswordFormComponentProps) => {
  return (
    <>
      <Form.Root
        onSubmit={(event) => {
          handlePatchPassword();
          event.preventDefault();
        }}
      >
        <Card x-chunk="dashboard-04-chunk-2">
          <CardHeader>
            <CardTitle>{t("Password")}</CardTitle>
            <CardDescription>
              {t("Enter your current password, then set and confirm a new password.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex w-full flex-col gap-4">
              <Form.Field name="currentPassword" className="w-full">
                <InputComponent
                  id="currentPassword"
                  onChange={(value) => {
                    handleInput({
                      target: { name: "currentPassword", value },
                    });
                  }}
                  value={currentPassword}
                  isForm
                  password={true}
                  placeholder={t("Current Password")}
                  className="w-full"
                />
                <Form.Message match="valueMissing" className="field-invalid">
                  {t("Please enter your current password")}
                </Form.Message>
              </Form.Field>

              <div className="flex w-full gap-4">
                <Form.Field name="password" className="w-full">
                  <InputComponent
                    id="password"
                    onChange={(value) => {
                      handleInput({ target: { name: "password", value } });
                    }}
                    value={password}
                    isForm
                    password={true}
                    placeholder={t("Password")}
                    className="w-full"
                  />
                  <Form.Message match="valueMissing" className="field-invalid">
                    {t("Please enter your password")}
                  </Form.Message>
                </Form.Field>
                <Form.Field name="cnfPassword" className="w-full">
                  <InputComponent
                    id="cnfPassword"
                    onChange={(value) => {
                      handleInput({
                        target: { name: "cnfPassword", value },
                      });
                    }}
                    value={cnfPassword}
                    isForm
                    password={true}
                    placeholder={t("Confirm Password")}
                    className="w-full"
                  />

                  <Form.Message className="field-invalid" match="valueMissing">
                    {t("Please confirm your password")}
                  </Form.Message>
                </Form.Field>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Form.Submit asChild>
              <Button type="submit">{t("Save")}</Button>
            </Form.Submit>
          </CardFooter>
        </Card>
      </Form.Root>
    </>
  );
};
export default PasswordFormComponent;
