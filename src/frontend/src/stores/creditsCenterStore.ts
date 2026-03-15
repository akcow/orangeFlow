import { create } from "zustand";

export type CreditsCenterSection =
  | "topup"
  | "billing"
  | "teamSettings"
  | "teamBenefits";

type CreditsCenterStore = {
  open: boolean;
  section: CreditsCenterSection;
  openCreditsCenter: (section?: CreditsCenterSection) => void;
  closeCreditsCenter: () => void;
  setSection: (section: CreditsCenterSection) => void;
};

const useCreditsCenterStore = create<CreditsCenterStore>((set) => ({
  open: false,
  section: "topup",
  openCreditsCenter: (section = "topup") => set({ open: true, section }),
  closeCreditsCenter: () => set({ open: false }),
  setSection: (section) => set({ section }),
}));

export default useCreditsCenterStore;
