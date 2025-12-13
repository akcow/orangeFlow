import InputFileComponent from "@/components/core/parameterRenderComponent/components/inputFileComponent";
import type {
  FileComponentType,
  InputProps,
} from "@/components/core/parameterRenderComponent/types";

export default function CustomInputFileComponent({
  value,
  file_path,
  handleOnNewValue,
  disabled,
  fileTypes,
  isList,
  tempFile = true,
  editNode = false,
  id,
  variant = "default",
  triggerLabel,
  triggerClassName,
  onUploadComplete,
}: InputProps<string, FileComponentType>): JSX.Element {
  return (
    <InputFileComponent
      value={value}
      file_path={file_path}
      handleOnNewValue={handleOnNewValue}
      disabled={disabled}
      fileTypes={fileTypes}
      isList={isList}
      tempFile={tempFile}
      editNode={editNode}
      id={`inputfile_${id}`}
      variant={variant}
      triggerLabel={triggerLabel}
      triggerClassName={triggerClassName}
      onUploadComplete={onUploadComplete}
    />
  );
}
