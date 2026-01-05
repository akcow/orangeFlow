import Fuse from "fuse.js";
import { cloneDeep } from "lodash";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useShallow } from "zustand/react/shallow";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import {
  Sidebar,
  SidebarContent,
  useSidebar,
} from "@/components/ui/sidebar";
import SkeletonGroup from "@/components/ui/skeletonGroup";
import { ENABLE_NEW_SIDEBAR } from "@/customization/feature-flags";
import { useShortcutsStore } from "@/stores/shortcuts";
import { setLocalStorage } from "@/utils/local-storage-util";
import { nodeColors } from "@/utils/styleUtils";
import { cn, getBooleanFromStorage, removeCountFromString } from "@/utils/utils";
import useFlowStore from "../../../../stores/flowStore";
import { useTypesStore } from "../../../../stores/typesStore";
import type { APIClassType } from "../../../../types/api";
import isWrappedWithClass from "../PageComponent/utils/is-wrapped-with-class";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import SidebarDraggableComponent from "./components/sidebarDraggableComponent";
import NoResultsMessage from "./components/emptySearchComponent";
import { SidebarHeaderComponent } from "./components/sidebarHeader";
import SidebarSegmentedNav from "./components/sidebarSegmentedNav";
import { applyBetaFilter } from "./helpers/apply-beta-filter";
import { applyComponentFilter } from "./helpers/apply-component-filter";
import { applyEdgeFilter } from "./helpers/apply-edge-filter";
import { applyLegacyFilter } from "./helpers/apply-legacy-filter";
import { combinedResultsFn } from "./helpers/combined-results";
import { filteredDataFn } from "./helpers/filtered-data";
import { normalizeString } from "./helpers/normalize-string";
import sensitiveSort from "./helpers/sensitive-sort";
import { traditionalSearchMetadata } from "./helpers/traditional-search-metadata";

const CUSTOM_COMPONENT_KEYS = [
  "DoubaoImageCreator",
  "DoubaoVideoGenerator",
  "DoubaoTTS",
  "TextCreation",
];
const CUSTOM_CATEGORY_NAME = "custom_components";
const CUSTOM_CATEGORY_META = {
  display_name: "自定义组件",
  name: CUSTOM_CATEGORY_NAME,
  icon: "ToyBrick",
};
const CATEGORIES = [CUSTOM_CATEGORY_META];
const customNodeColors = { ...nodeColors, [CUSTOM_CATEGORY_NAME]: "#2563eb" };

function extractCustomComponents(data: Record<string, any>) {
  const result: Record<string, Record<string, any>> = {
    [CUSTOM_CATEGORY_NAME]: {},
  };
  Object.values(data ?? {}).forEach((category: any) => {
    Object.entries(category ?? {}).forEach(([key, value]) => {
      const typeName = (value as any)?.type ?? key;
      if (CUSTOM_COMPONENT_KEYS.includes(typeName)) {
        result[CUSTOM_CATEGORY_NAME][key] = value;
      }
    });
  });
  return result;
}

// Search context for the sidebar
export type SearchContextType = {
  focusSearch: () => void;
  isSearchFocused: boolean;
  // Additional properties for the sidebar to use
  search?: string;
  setSearch?: (value: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  handleInputFocus?: () => void;
  handleInputBlur?: () => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export const SearchContext = createContext<SearchContextType | null>(null);

export function useSearchContext() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearchContext must be used within SearchProvider");
  }
  return context;
}

// Create a provider that can be used at the FlowPage level
export function FlowSearchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const focusSearchInput = useCallback(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const handleInputFocus = useCallback(() => {
    setIsInputFocused(true);
  }, []);

  const handleInputBlur = useCallback(() => {
    setIsInputFocused(false);
  }, []);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value);
    },
    [],
  );

  const searchContextValue = useMemo(
    () => ({
      focusSearch: focusSearchInput,
      isSearchFocused: isInputFocused,
      // Also expose the search state and handlers for the sidebar to use
      search,
      setSearch,
      searchInputRef,
      handleInputFocus,
      handleInputBlur,
      handleInputChange,
    }),
    [
      focusSearchInput,
      isInputFocused,
      search,
      handleInputFocus,
      handleInputBlur,
      handleInputChange,
    ],
  );

  return (
    <SearchContext.Provider value={searchContextValue}>
      {children}
    </SearchContext.Provider>
  );
}

interface FlowSidebarComponentProps {
  isLoading?: boolean;
  showLegacy?: boolean;
  setShowLegacy?: (value: boolean) => void;
}

export function FlowSidebarComponent({ isLoading }: FlowSidebarComponentProps) {
  const data = useTypesStore((state) => state.data);

  const {
    getFilterEdge,
    setFilterEdge,
    filterType,
    getFilterComponent,
    setFilterComponent,
  } = useFlowStore(
    useShallow((state) => ({
      getFilterEdge: state.getFilterEdge,
      setFilterEdge: state.setFilterEdge,
      filterType: state.filterType,
      getFilterComponent: state.getFilterComponent,
      setFilterComponent: state.setFilterComponent,
    })),
  );

  const { activeSection, setOpen, setActiveSection } = useSidebar();

  // Get search state from context
  const context = useSearchContext();
  // Unconditional fallback ref to satisfy Rules of Hooks
  const fallbackSearchInputRef = useRef<HTMLInputElement | null>(null);
  const {
    search = "",
    setSearch = () => {},
    searchInputRef = fallbackSearchInputRef,
    isSearchFocused = false,
    handleInputFocus = () => {},
    handleInputBlur = () => {},
    handleInputChange: originalHandleInputChange = () => {},
  } = context;

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      originalHandleInputChange(event);
      // Set active section to search when user first enters text
      if (event.target.value.length > 0 && search.length === 0) {
        setActiveSection("search");
      }
    },
    [originalHandleInputChange, search, setActiveSection],
  );

  const showBetaStorage = getBooleanFromStorage("showBeta", true);
  const showLegacyStorage = getBooleanFromStorage("showLegacy", false);

  // State
  const [fuse, setFuse] = useState<Fuse<any> | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showBeta, setShowBeta] = useState(showBetaStorage);
  const [showLegacy, setShowLegacy] = useState(showLegacyStorage);

  // Functions to handle state changes with localStorage persistence
  const handleSetShowBeta = useCallback((value: boolean) => {
    setShowBeta(value);
    setLocalStorage("showBeta", value.toString());
  }, []);

  const handleSetShowLegacy = useCallback((value: boolean) => {
    setShowLegacy(value);
    setLocalStorage("showLegacy", value.toString());
  }, []);

  const baseData = useMemo(
    () => extractCustomComponents(data),
    [data],
  );

  const [dataFilter, setFilterData] = useState(baseData);
  const customItems = dataFilter[CUSTOM_CATEGORY_NAME] ?? {};

  const searchResults = useMemo(() => {
    if (!search || !fuse) return null;

    const searchTerm = normalizeString(search);
    const fuseResults = fuse.search(search).map((result) => ({
      ...result,
      item: { ...result.item, score: result.score },
    }));

    const fuseCategories = fuseResults.map((result) => result.item.category);
    const combinedResults = combinedResultsFn(fuseResults, baseData);
    const traditionalResults = traditionalSearchMetadata(baseData, searchTerm);

    return {
      fuseResults,
      fuseCategories,
      combinedResults,
      traditionalResults,
    };
  }, [search, fuse, baseData]);

  const searchFilteredData = useMemo(() => {
    if (!search || !searchResults) return cloneDeep(baseData);

    const filteredData = filteredDataFn(
      baseData,
      searchResults.combinedResults,
      searchResults.traditionalResults,
    );

    return filteredData;
  }, [baseData, search, searchResults]);

  const finalFilteredData = useMemo(() => {
    let filteredData = searchFilteredData;

    if (getFilterEdge?.length > 0) {
      filteredData = applyEdgeFilter(filteredData, getFilterEdge);
    }

    if (getFilterComponent !== "") {
      filteredData = applyComponentFilter(filteredData, getFilterComponent);
    }

    if (!showBeta) {
      filteredData = applyBetaFilter(filteredData);
    }

    if (!showLegacy) {
      filteredData = applyLegacyFilter(filteredData);
    }

    return filteredData;
  }, [
    searchFilteredData,
    getFilterEdge,
    getFilterComponent,
    showBeta,
    showLegacy,
  ]);

  const hasResults = useMemo(() => {
    return Object.entries(dataFilter).some(
      ([category, items]) =>
        Object.keys(items).length > 0 &&
        CATEGORIES.some((c) => c.name === category),
    );
  }, [dataFilter]);

  const handleClearSearch = useCallback(() => {
    setSearch("");
    setFilterData(baseData);
  }, [baseData, setSearch]);

  useEffect(() => {
    if (filterType || getFilterComponent !== "") {
      setOpen(true);
      setActiveSection("search");
    }
  }, [filterType, getFilterComponent, setOpen]);

  useEffect(() => {
    setFilterData(finalFilteredData);
  }, [
    finalFilteredData,
    search,
    filterType,
    getFilterEdge,
    getFilterComponent,
  ]);

  useEffect(() => {
    const options = {
      keys: ["display_name", "description", "type", "category"],
      threshold: 0.2,
      includeScore: true,
    };

    const fuseData = Object.entries(baseData).flatMap(([category, items]) =>
      Object.entries(items).map(([key, value]) => ({
        ...value,
        category,
        key,
      })),
    );

    setFuse(new Fuse(fuseData, options));
  }, [baseData]);

  useEffect(() => {
    if (getFilterEdge.length !== 0 || getFilterComponent !== "") {
      setSearch("");
    }
  }, [getFilterEdge, getFilterComponent, baseData]);

  const searchComponentsSidebar = useShortcutsStore(
    (state) => state.searchComponentsSidebar,
  );

  useHotkeys(
    searchComponentsSidebar,
    (e: KeyboardEvent) => {
      if (isWrappedWithClass(e, "noflow")) return;
      e.preventDefault();
      searchInputRef.current?.focus();
      setOpen(true);
    },
    {
      preventDefault: true,
    },
  );

  useHotkeys(
    "esc",
    (event) => {
      event.preventDefault();
      searchInputRef.current?.blur();
    },
    {
      enableOnFormTags: true,
      enabled: isSearchFocused,
    },
  );

  const onDragStart = useCallback(
    (
      event: React.DragEvent<any>,
      data: { type: string; node?: APIClassType },
    ) => {
      var crt = event.currentTarget.cloneNode(true);
      crt.style.position = "absolute";
      crt.style.width = "215px";
      crt.style.top = "-500px";
      crt.style.right = "-500px";
      crt.classList.add("cursor-grabbing");
      document.body.appendChild(crt);
      event.dataTransfer.setDragImage(crt, 0, 0);
      event.dataTransfer.setData("genericNode", JSON.stringify(data));
    },
    [],
  );

  const hasCoreComponents = useMemo(() => {
    const categoriesWithItems = CATEGORIES.filter(
      (item) =>
        dataFilter[item.name] && Object.keys(dataFilter[item.name]).length > 0,
    );
    const result = categoriesWithItems.length > 0;
    return result;
  }, [dataFilter]);

  const hasSearchInput =
    search !== "" || filterType !== undefined || getFilterComponent !== "";

  const showComponents =
    (ENABLE_NEW_SIDEBAR &&
      hasCoreComponents &&
      (activeSection === "components" || activeSection === "search")) ||
    (hasSearchInput && hasCoreComponents && ENABLE_NEW_SIDEBAR) ||
    !ENABLE_NEW_SIDEBAR;

  const [category, component] = getFilterComponent?.split(".") ?? ["", ""];

  const filterDescription =
    getFilterComponent !== ""
      ? (baseData[category][component]?.display_name ?? "")
      : (filterType?.type ?? "");

  const filterName =
    getFilterComponent !== ""
      ? "Component"
      : filterType
        ? filterType.source
          ? "Input"
          : "Output"
        : "";

  const resetFilters = useCallback(() => {
    setFilterEdge([]);
    setFilterComponent("");
    setFilterData(baseData);
  }, [setFilterEdge, setFilterComponent, setFilterData, baseData]);

  useEffect(() => {
    if (
      ENABLE_NEW_SIDEBAR &&
      (activeSection === "mcp" || activeSection === "bundles")
    ) {
      setActiveSection("components");
    }
  }, [activeSection, setActiveSection, ENABLE_NEW_SIDEBAR]);

  return (
    <Sidebar
      collapsible="offcanvas"
      data-testid="shad-sidebar"
      className="noflow select-none"
    >
      <div className="flex h-full">
        {ENABLE_NEW_SIDEBAR && <SidebarSegmentedNav />}
        <div
          className={cn(
            "flex flex-col h-full w-full group-data-[collapsible=icon]:hidden",
            ENABLE_NEW_SIDEBAR && "sidebar-segmented",
          )}
        >
          <SidebarHeaderComponent
            showConfig={showConfig}
            setShowConfig={setShowConfig}
            showBeta={showBeta}
            setShowBeta={handleSetShowBeta}
            showLegacy={showLegacy}
            setShowLegacy={handleSetShowLegacy}
            searchInputRef={searchInputRef}
            isInputFocused={isSearchFocused}
            search={search}
            handleInputFocus={handleInputFocus}
            handleInputBlur={handleInputBlur}
            handleInputChange={handleInputChange}
            filterName={filterName}
            filterDescription={filterDescription}
            resetFilters={resetFilters}
          />

          <SidebarContent
            segmentedSidebar={ENABLE_NEW_SIDEBAR}
            className="flex-1 group-data-[collapsible=icon]:hidden gutter-stable"
          >
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1 p-3">
                  <SkeletonGroup count={13} className="my-0.5 h-7" />
                </div>
                <div className="h-8" />
                <div className="flex flex-col gap-1 px-3 pt-2">
                  <SkeletonGroup count={21} className="my-0.5 h-7" />
                </div>
              </div>
            ) : (
              <>
                {hasResults ? (
                  <>
                    {showComponents && (
                      <div className="p-3 pr-2">
                        <div className="flex flex-col gap-1 py-1">
                          {Object.keys(customItems).length === 0 ? (
                            <NoResultsMessage
                              onClearSearch={handleClearSearch}
                              showConfig={showConfig}
                              setShowConfig={setShowConfig}
                            />
                          ) : (
                            Object.keys(customItems)
                              .sort((a, b) =>
                                sensitiveSort(
                                  customItems[a].display_name,
                                  customItems[b].display_name,
                                ),
                              )
                              .map((itemName) => {
                                const currentItem = customItems[itemName];
                                return (
                                  <ShadTooltip
                                    content={currentItem.display_name}
                                    side="right"
                                    key={itemName}
                                  >
                                    <SidebarDraggableComponent
                                      sectionName={CUSTOM_CATEGORY_NAME}
                                      apiClass={currentItem}
                                      icon={
                                        currentItem.icon ??
                                        CUSTOM_CATEGORY_META.icon
                                      }
                                      onDragStart={(event) =>
                                        onDragStart(event, {
                                          type: removeCountFromString(
                                            itemName,
                                          ),
                                          node: currentItem,
                                        })
                                      }
                                      color={customNodeColors[CUSTOM_CATEGORY_NAME]}
                                      itemName={itemName}
                                      error={!!currentItem.error}
                                      display_name={currentItem.display_name}
                                      official={currentItem.official !== false}
                                      beta={currentItem.beta ?? false}
                                      legacy={currentItem.legacy ?? false}
                                      disabled={false}
                                      disabledTooltip=""
                                    />
                                  </ShadTooltip>
                                );
                              })
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <NoResultsMessage
                    onClearSearch={handleClearSearch}
                    showConfig={showConfig}
                    setShowConfig={setShowConfig}
                  />
                )}
              </>
            )}
          </SidebarContent>
        </div>
      </div>
    </Sidebar>
  );
}

FlowSidebarComponent.displayName = "FlowSidebarComponent";

export default memo(
  FlowSidebarComponent,
  (
    prevProps: FlowSidebarComponentProps,
    nextProps: FlowSidebarComponentProps,
  ) => {
    return (
      prevProps.showLegacy === nextProps.showLegacy &&
      prevProps.setShowLegacy === nextProps.setShowLegacy
    );
  },
);
