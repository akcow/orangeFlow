import * as Form from "@radix-ui/react-form";
import { type FormEvent, useEffect, useState } from "react";
import LangflowLogo from "@/assets/LangflowLogo.svg?react";
import InputComponent from "@/components/core/parameterRenderComponent/components/inputComponent";
import { useAddUser } from "@/controllers/API/queries/auth";
import { CustomLink } from "@/customization/components/custom-link";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import { track } from "@/customization/utils/analytics";
import { t } from "@/i18n/t";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { SIGNUP_ERROR_ALERT } from "../../constants/alerts_constants";
import { CONTROL_INPUT_STATE } from "../../constants/constants";
import useAlertStore from "../../stores/alertStore";
import type {
  inputHandlerEventType,
  signUpInputStateType,
  UserInputType,
} from "../../types/components";

export default function SignUp(): JSX.Element {
  const [inputState, setInputState] =
    useState<signUpInputStateType>(CONTROL_INPUT_STATE);

  const [isDisabled, setDisableBtn] = useState<boolean>(true);

  const { password, cnfPassword, username, nickname } = inputState;
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const navigate = useCustomNavigate();

  const { mutate: mutateAddUser } = useAddUser();

  function handleInput({
    target: { name, value },
  }: inputHandlerEventType): void {
    setInputState((prev) => ({ ...prev, [name]: value }));
  }

  useEffect(() => {
    if (password !== cnfPassword) return setDisableBtn(true);
    if (password === "" || cnfPassword === "") return setDisableBtn(true);
    if (username === "" || nickname === "") return setDisableBtn(true);
    setDisableBtn(false);
  }, [password, cnfPassword, username, nickname, handleInput]);

  function handleSignup(): void {
    const { username, password } = inputState;
    const newUser: UserInputType = {
      username: username.trim(),
      nickname: nickname.trim(),
      password: password.trim(),
    };

    mutateAddUser(newUser, {
      onSuccess: (user) => {
        track("User Signed Up", user);
        setSuccessData({
          title: t("Account created successfully. You can sign in now."),
        });
        navigate("/login");
      },
      onError: (error) => {
        const {
          response: {
            data: { detail },
          },
        } = error;
        setErrorData({
          title: SIGNUP_ERROR_ALERT,
          list: [detail],
        });
      },
    });
  }

  return (
    <Form.Root
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        if (password === "") {
          event.preventDefault();
          return;
        }

        const _data = Object.fromEntries(new FormData(event.currentTarget));
        event.preventDefault();
      }}
      className="h-screen w-full"
    >
      <div className="flex h-full w-full flex-col items-center justify-center bg-muted">
        <div className="flex w-72 flex-col items-center justify-center gap-2">
          <LangflowLogo
            title={t("OrangeFlow logo")}
            className="mb-4 h-10 w-10 scale-[1.5]"
          />
          <span className="mb-6 text-2xl font-semibold text-primary">
            {t("Sign up for OrangeFlow")}
          </span>
          <div className="mb-3 w-full">
            <Form.Field name="username">
              <Form.Label className="data-[invalid]:label-invalid">
                {t("Username")}{" "}
                <span className="font-medium text-destructive">*</span>
              </Form.Label>

              <Form.Control asChild>
                <Input
                  type="username"
                  onChange={({ target: { value } }) => {
                    handleInput({ target: { name: "username", value } });
                  }}
                  value={username}
                  className="w-full"
                  required
                  placeholder={t("Username")}
                />
              </Form.Control>

              <Form.Message match="valueMissing" className="field-invalid">
                {t("Please enter your username")}
              </Form.Message>
            </Form.Field>
          </div>
          <div className="mb-3 w-full">
            <Form.Field name="nickname">
              <Form.Label className="data-[invalid]:label-invalid">
                {t("Nickname")}{" "}
                <span className="font-medium text-destructive">*</span>
              </Form.Label>

              <Form.Control asChild>
                <Input
                  type="text"
                  onChange={({ target: { value } }) => {
                    handleInput({ target: { name: "nickname", value } });
                  }}
                  value={nickname}
                  className="w-full"
                  required
                  placeholder={t("Nickname")}
                />
              </Form.Control>

              <Form.Message match="valueMissing" className="field-invalid">
                {t("Please enter your nickname")}
              </Form.Message>
            </Form.Field>
          </div>
          <div className="mb-3 w-full">
            <Form.Field name="password" serverInvalid={password != cnfPassword}>
              <Form.Label className="data-[invalid]:label-invalid">
                {t("Password")}{" "}
                <span className="font-medium text-destructive">*</span>
              </Form.Label>
              <InputComponent
                onChange={(value) => {
                  handleInput({ target: { name: "password", value } });
                }}
                value={password}
                isForm
                password={true}
                required
                placeholder={t("Password")}
                className="w-full"
              />

              <Form.Message className="field-invalid" match="valueMissing">
                {t("Please enter a password")}
              </Form.Message>

              {password != cnfPassword && (
                <Form.Message className="field-invalid">
                  {t("Passwords do not match")}
                </Form.Message>
              )}
            </Form.Field>
          </div>
          <div className="w-full">
            <Form.Field
              name="confirmpassword"
              serverInvalid={password != cnfPassword}
            >
              <Form.Label className="data-[invalid]:label-invalid">
                {t("Confirm your password")}{" "}
                <span className="font-medium text-destructive">*</span>
              </Form.Label>

              <InputComponent
                onChange={(value) => {
                  handleInput({ target: { name: "cnfPassword", value } });
                }}
                value={cnfPassword}
                isForm
                password={true}
                required
                placeholder={t("Confirm your password")}
                className="w-full"
              />

              <Form.Message className="field-invalid" match="valueMissing">
                {t("Please confirm your password")}
              </Form.Message>
            </Form.Field>
          </div>
          <div className="w-full">
            <Form.Submit asChild>
              <Button
                unstyled
                disabled={isDisabled}
                type="submit"
                className="mr-3 mt-6 inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-700 disabled:opacity-70 disabled:pointer-events-none"
                onClick={() => {
                  handleSignup();
                }}
              >
                {t("Sign up")}
              </Button>
            </Form.Submit>
          </div>
          <div className="w-full">
            <CustomLink to="/login">
              <Button className="w-full" variant="outline">
                {t("Already have an account?")}&nbsp;<b>{t("Sign in")}</b>
              </Button>
            </CustomLink>
          </div>
        </div>
      </div>
    </Form.Root>
  );
}
