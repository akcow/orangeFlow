import * as Form from "@radix-ui/react-form";
import { Eye, EyeOff } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import IconComponent from "@/components/common/genericIconComponent";
import { t } from "@/i18n/t";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { CONTROL_NEW_USER } from "../../constants/constants";
import { AuthContext } from "../../contexts/authContext";
import type {
  inputHandlerEventType,
  UserInputType,
  UserManagementType,
} from "../../types/components";
import BaseModal from "../baseModal";

export default function UserManagementModal({
  title,
  titleHeader,
  cancelText,
  confirmationText,
  children,
  icon,
  data,
  index,
  onConfirm,
  asChild,
}: UserManagementType) {
  const [pwdVisible, setPwdVisible] = useState(false);
  const [confirmPwdVisible, setConfirmPwdVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState(data?.password ?? "");
  const [username, setUserName] = useState(data?.username ?? "");
  const [nickname, setNickname] = useState(data?.nickname ?? "");
  const [confirmPassword, setConfirmPassword] = useState(data?.password ?? "");
  const [isActive, setIsActive] = useState(data?.is_active ?? false);
  const [isSuperUser, setIsSuperUser] = useState(data?.is_superuser ?? false);
  const [isReviewer, setIsReviewer] = useState(data?.is_reviewer ?? false);
  const [inputState, setInputState] = useState<UserInputType>(CONTROL_NEW_USER);
  const { userData } = useContext(AuthContext);

  function handleInput({
    target: { name, value },
  }: inputHandlerEventType): void {
    setInputState((prev) => ({ ...prev, [name]: value }));
  }

  useEffect(() => {
    if (open) {
      if (!data) {
        resetForm();
        setInputState(CONTROL_NEW_USER);
      } else {
        setUserName(data.username);
        setNickname(data.nickname ?? "");
        setIsActive(data.is_active);
        setIsSuperUser(data.is_superuser);
        setIsReviewer(data.is_reviewer ?? false);
        setInputState({
          username: data.username,
          nickname: data.nickname ?? "",
          password: "",
          is_active: data.is_active,
          is_superuser: data.is_superuser,
          is_reviewer: data.is_reviewer ?? false,
          id: data.id,
          create_at: data.create_at,
          updated_at: data.updated_at,
        });
      }
    }
  }, [open]);

  function resetForm() {
    setPassword("");
    setUserName("");
    setNickname("");
    setConfirmPassword("");
    setIsActive(false);
    setIsSuperUser(false);
    setIsReviewer(false);
    setInputState(CONTROL_NEW_USER);
  }

  return (
    <BaseModal size="medium-h-full" open={open} setOpen={setOpen}>
      <BaseModal.Trigger asChild={asChild}>{children}</BaseModal.Trigger>
      <BaseModal.Header description={titleHeader}>
        <span className="pr-2">{title}</span>
        <IconComponent
          name={icon}
          className="h-6 w-6 pl-1 text-foreground"
          aria-hidden="true"
        />
      </BaseModal.Header>
      <BaseModal.Content>
        <Form.Root
          onSubmit={(event) => {
            if (password !== confirmPassword) {
              event.preventDefault();
              return;
            }
            resetForm();
            onConfirm(1, inputState);
            setOpen(false);
            event.preventDefault();
          }}
        >
          <div className="grid gap-5">
            <Form.Field name="username">
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                }}
              >
                <Form.Label className="data-[invalid]:label-invalid">
                  {t("Username")}{" "}
                  <span className="font-medium text-destructive">*</span>
                </Form.Label>
              </div>
              <Form.Control asChild>
                <input
                  onChange={({ target: { value } }) => {
                    handleInput({ target: { name: "username", value } });
                    setUserName(value);
                  }}
                  value={username}
                  className="primary-input"
                  required
                  placeholder={t("Username")}
                />
              </Form.Control>
              <Form.Message match="valueMissing" className="field-invalid">
                {t("Please enter your username")}
              </Form.Message>
            </Form.Field>
            <Form.Field name="nickname">
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                }}
              >
                <Form.Label className="data-[invalid]:label-invalid">
                  {t("Nickname")}{" "}
                  <span className="font-medium text-destructive">*</span>
                </Form.Label>
              </div>
              <Form.Control asChild>
                <input
                  onChange={({ target: { value } }) => {
                    handleInput({ target: { name: "nickname", value } });
                    setNickname(value);
                  }}
                  value={nickname}
                  className="primary-input"
                  required
                  placeholder={t("Nickname")}
                />
              </Form.Control>
              <Form.Message match="valueMissing" className="field-invalid">
                {t("Please enter your nickname")}
              </Form.Message>
            </Form.Field>

            <div className="flex flex-row">
              <div className="mr-3 basis-1/2">
                <Form.Field
                  name="password"
                  serverInvalid={password != confirmPassword}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                    }}
                  >
                    <Form.Label className="data-[invalid]:label-invalid flex">
                      {t("Password")}{" "}
                      <span className="ml-1 mr-1 font-medium text-destructive">
                        *
                      </span>
                      {pwdVisible && (
                        <Eye
                          onClick={() => setPwdVisible(!pwdVisible)}
                          className="h-5 cursor-pointer"
                          strokeWidth={1.5}
                        />
                      )}
                      {!pwdVisible && (
                        <EyeOff
                          onClick={() => setPwdVisible(!pwdVisible)}
                          className="h-5 cursor-pointer"
                          strokeWidth={1.5}
                        />
                      )}
                    </Form.Label>
                  </div>
                  <Form.Control asChild>
                    <input
                      onChange={({ target: { value } }) => {
                        handleInput({ target: { name: "password", value } });
                        setPassword(value);
                      }}
                      value={password}
                      className="primary-input"
                      required={data ? false : true}
                      type={pwdVisible ? "text" : "password"}
                    />
                  </Form.Control>

                  <Form.Message className="field-invalid" match="valueMissing">
                    {t("Please enter a password")}
                  </Form.Message>

                  {password != confirmPassword && (
                    <Form.Message className="field-invalid">
                      {t("Passwords do not match")}
                    </Form.Message>
                  )}
                </Form.Field>
              </div>

              <div className="basis-1/2">
                <Form.Field
                  name="confirmpassword"
                  serverInvalid={password != confirmPassword}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                    }}
                  >
                    <Form.Label className="data-[invalid]:label-invalid flex">
                      {t("Confirm password")}{" "}
                      <span className="ml-1 mr-1 font-medium text-destructive">
                        *
                      </span>
                      {confirmPwdVisible && (
                        <Eye
                          onClick={() =>
                            setConfirmPwdVisible(!confirmPwdVisible)
                          }
                          className="h-5 cursor-pointer"
                          strokeWidth={1.5}
                        />
                      )}
                      {!confirmPwdVisible && (
                        <EyeOff
                          onClick={() =>
                            setConfirmPwdVisible(!confirmPwdVisible)
                          }
                          className="h-5 cursor-pointer"
                          strokeWidth={1.5}
                        />
                      )}
                    </Form.Label>
                  </div>
                  <Form.Control asChild>
                    <input
                      onChange={(input) => {
                        setConfirmPassword(input.target.value);
                      }}
                      value={confirmPassword}
                      className="primary-input"
                      required={data ? false : true}
                      type={confirmPwdVisible ? "text" : "password"}
                    />
                  </Form.Control>
                  <Form.Message className="field-invalid" match="valueMissing">
                    {t("Please confirm your password")}
                  </Form.Message>
                </Form.Field>
              </div>
            </div>
            <div className="flex gap-8">
              <Form.Field name="is_active">
                <div>
                  <Form.Label className="data-[invalid]:label-invalid mr-3">
                    {t("Active")}
                  </Form.Label>
                  <Form.Control asChild>
                    <Checkbox
                      value={isActive}
                      checked={isActive}
                      id="is_active"
                      className="relative top-0.5"
                      onCheckedChange={(value) => {
                        handleInput({ target: { name: "is_active", value } });
                        setIsActive(value);
                      }}
                    />
                  </Form.Control>
                </div>
              </Form.Field>
              {userData?.is_superuser && (
                <Form.Field name="is_superuser">
                  <div>
                    <Form.Label className="data-[invalid]:label-invalid mr-3">
                      {t("Superuser")}
                    </Form.Label>
                    <Form.Control asChild>
                      <Checkbox
                        checked={isSuperUser}
                        value={isSuperUser}
                        id="is_superuser"
                        className="relative top-0.5"
                        onCheckedChange={(value) => {
                          handleInput({
                            target: { name: "is_superuser", value },
                          });
                          setIsSuperUser(value);
                        }}
                      />
                    </Form.Control>
                  </div>
                </Form.Field>
              )}
              {userData?.is_superuser && (
                <Form.Field name="is_reviewer">
                  <div>
                    <Form.Label className="data-[invalid]:label-invalid mr-3">
                      审核员
                    </Form.Label>
                    <Form.Control asChild>
                      <Checkbox
                        checked={isReviewer}
                        value={isReviewer}
                        id="is_reviewer"
                        className="relative top-0.5"
                        onCheckedChange={(value) => {
                          handleInput({
                            target: { name: "is_reviewer", value },
                          });
                          setIsReviewer(value);
                        }}
                      />
                    </Form.Control>
                  </div>
                </Form.Field>
              )}
            </div>
          </div>

          <div className="float-right">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
              }}
              className="mr-3"
            >
              {cancelText}
            </Button>

            <Form.Submit asChild>
              <Button className="mt-8">{confirmationText}</Button>
            </Form.Submit>
          </div>
        </Form.Root>
      </BaseModal.Content>
    </BaseModal>
  );
}
