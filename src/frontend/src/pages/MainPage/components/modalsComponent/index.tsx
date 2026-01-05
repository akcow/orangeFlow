import DeleteConfirmationModal from "../../../../modals/deleteConfirmationModal";

interface ModalsProps {
  openDeleteFolderModal: boolean;
  setOpenDeleteFolderModal: (value: boolean) => void;
  handleDeleteFolder: () => void;
}

const ModalsComponent = ({
  openDeleteFolderModal = false,
  setOpenDeleteFolderModal = () => {},
  handleDeleteFolder = () => {},
}: ModalsProps) => (
  <>
    {openDeleteFolderModal && (
      <DeleteConfirmationModal
        open={openDeleteFolderModal}
        setOpen={setOpenDeleteFolderModal}
        onConfirm={() => {
          handleDeleteFolder();
          setOpenDeleteFolderModal(false);
        }}
        description="folder"
        note={"and all associated flows and components"}
      >
        <></>
      </DeleteConfirmationModal>
    )}
  </>
);

export default ModalsComponent;
