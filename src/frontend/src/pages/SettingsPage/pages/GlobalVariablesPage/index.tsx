import type {
  ColDef,
  RowClickedEvent,
  SelectionChangedEvent,
} from "ag-grid-community";
import { useRef, useState } from "react";

import GlobalVariableModal from "@/components/core/GlobalVariableModal/GlobalVariableModal";
import TableComponent from "@/components/core/parameterRenderComponent/components/tableComponent";
import {
  useDeleteGlobalVariables,
  useGetGlobalVariables,
} from "@/controllers/API/queries/variables";
import { t } from "@/i18n/t";
import type { GlobalVariable } from "@/types/global_variables";
import IconComponent, {
  ForwardedIconComponent,
} from "../../../../components/common/genericIconComponent";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import useAlertStore from "../../../../stores/alertStore";

export default function GlobalVariablesPage() {
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const [openModal, setOpenModal] = useState(false);
  const initialData = useRef<GlobalVariable | undefined>(undefined);
  const BadgeRenderer = (props) => {
    return props.value !== "" ? (
      <div>
        <Badge variant="outline" size="md" className="font-normal">
          {props.value}
        </Badge>
      </div>
    ) : (
      <div></div>
    );
  };

  const DropdownEditor = ({ options, value, onValueChange }) => {
    return (
      <select
        className="w-full bg-transparent text-sm outline-none"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {options?.map((opt) => (
          <option key={opt} value={opt}>
            {t(opt)}
          </option>
        ))}
      </select>
    );
  };
  // Column Definitions: Defines the columns to be displayed.
  const colDefs: ColDef[] = [
    {
      headerName: t("Variable Name"),
      field: "name",
      flex: 2,
    }, //This column will be twice as wide as the others
    {
      headerName: t("Type"),
      field: "type",
      cellRenderer: BadgeRenderer,
      cellEditor: DropdownEditor,
      cellEditorParams: {
        options: ["Generic", "Credential"],
      },
      flex: 1,
    },
    {
      headerName: t("Value"),
      field: "value",
    },
    {
      headerName: t("Apply To Fields"),
      field: "default_fields",
      valueFormatter: (params) => {
        return params.value?.join(", ") ?? "";
      },
      flex: 1,
      resizable: false,
    },
  ];

  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const { data: globalVariables } = useGetGlobalVariables();
  const { mutate: mutateDeleteGlobalVariable } = useDeleteGlobalVariables();

  async function removeVariables() {
    selectedRows.map(async (row) => {
      const id = globalVariables?.find((variable) => variable.name === row)?.id;
      mutateDeleteGlobalVariable(
        { id },
        {
          onError: () => {
            setErrorData({
              title: t("Error deleting variable"),
              list: [t("ID not found for variable: {{name}}", { name: row })],
            });
          },
        },
      );
    });
  }

  function updateVariables(event: RowClickedEvent<GlobalVariable>) {
    initialData.current = event.data;
    setOpenModal(true);
  }

  return (
    <div className="flex h-full w-full flex-col justify-between gap-6">
      <div className="flex w-full items-start justify-between gap-6">
        <div className="flex w-full flex-col">
          <h2
            className="flex items-center text-lg font-semibold tracking-tight"
            data-testid="settings_menu_header"
          >
            {t("Global Variables")}
            <ForwardedIconComponent
              name="Globe"
              className="ml-2 h-5 w-5 text-primary"
            />
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("Manage global variables and assign them to fields.")}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <GlobalVariableModal asChild>
            <Button data-testid="api-key-button-store" variant="primary">
              <IconComponent name="Plus" className="w-4" />
              {t("Add New")}
            </Button>
          </GlobalVariableModal>
        </div>
      </div>

      <div className="flex h-full w-full flex-col justify-between">
        <TableComponent
          key={"globalVariables"}
          overlayNoRowsTemplate={t("No data available")}
          onSelectionChanged={(event: SelectionChangedEvent) => {
            setSelectedRows(event.api.getSelectedRows().map((row) => row.name));
          }}
          rowSelection="multiple"
          onRowClicked={updateVariables}
          suppressRowClickSelection={true}
          pagination={true}
          columnDefs={colDefs}
          rowData={globalVariables ?? []}
          onDelete={removeVariables}
        />
        {initialData.current && (
          <GlobalVariableModal
            key={initialData.current.id}
            initialData={initialData.current}
            open={openModal}
            setOpen={setOpenModal}
          />
        )}
      </div>
    </div>
  );
}
