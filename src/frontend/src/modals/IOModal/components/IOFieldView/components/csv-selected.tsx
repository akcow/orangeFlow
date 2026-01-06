import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../components/ui/select";
import { t } from "@/i18n/t";

export default function CsvSelect({ node, handleChangeSelect }): JSX.Element {
  return (
    <>
      <div className="flex justify-between">
        {t("Expand the output to see the CSV")}
      </div>
      <div className="flex items-center justify-between pt-5">
        <span>{t("CSV separator")}&nbsp;</span>
        <Select
          value={node.data.node.template.separator.value}
          onValueChange={(e) => handleChangeSelect(e)}
        >
          <SelectTrigger className="w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {node?.data?.node?.template?.separator?.options.map(
                (separator) => (
                  <SelectItem key={separator} value={separator}>
                    {separator}
                  </SelectItem>
                ),
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
