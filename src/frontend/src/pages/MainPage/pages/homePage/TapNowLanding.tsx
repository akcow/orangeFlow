import React from "react";
import {
  Video,
  Image as ImageIcon,
  User,
  Sparkles,
  Film,
  LayoutTemplate,
  Search,
  Palette,
  ArrowRight,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import TapNowCarousel from "../../../../components/TapNowCarousel";

interface TapNowLandingProps {
  onCreateNew: () => void;
  onOpenTemplates?: () => void;
  children?: React.ReactNode; // For the list of workflows
}

export const TapNowLanding = ({
  onCreateNew,
  onOpenTemplates,
  children,
}: TapNowLandingProps) => {
  const { t } = useTranslation();

  const features = [
    { icon: Video, label: t("Scribble to video"), color: "text-green-400" },
    { icon: ImageIcon, label: t("Scribble to image"), color: "text-yellow-400" },
    { icon: User, label: t("Pose control"), color: "text-pink-400" },
    { icon: Sparkles, label: t("Beauty and super-resolution in one click"), color: "text-blue-400" },
    { icon: Film, label: t("One-click scene pull"), color: "text-cyan-400" },
    { icon: LayoutTemplate, label: t("Storyboard planning"), color: "text-purple-400" },
    { icon: Search, label: t("Find inspiration"), color: "text-red-400" },
    { icon: Palette, label: t("Moodboard planning"), color: "text-green-400" },
  ];

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto bg-black text-white">
      {/* Carousel Section */}
      <div className="px-8 pt-8">
        <TapNowCarousel />
      </div>

      {/* Featured Functions Section - Compact Layout (p3) */}
      <div className="px-8 pb-8">
        <h2 className="text-xl font-semibold mb-4 text-white">{t("Featured capabilities")}</h2>
        
        <div className="flex gap-4 h-[160px]">
          {/* Create New Project Card - Wide, Custom Gradient */}
          <div 
            onClick={onCreateNew}
            className="w-[300px] flex-shrink-0 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 flex flex-col justify-between cursor-pointer hover:opacity-90 transition-all relative overflow-hidden group shadow-lg border border-white/10"
          >
             {/* Decorative */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/20 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
            
            <div className="z-10 flex flex-col h-full justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Plus className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white tracking-wide">{t("Create new project")}</h3>
              </div>
            
              <Button 
                className="w-fit bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-md rounded-lg px-4 py-1 text-sm h-8"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateNew();
                }}
              >
                {t("Try now")}
              </Button>
            </div>
          </div>

          {/* Feature Grid - Compact 2x4 */}
          <div className="flex-1 grid grid-cols-4 grid-rows-2 gap-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-lg bg-[#111111] px-4 py-2 hover:bg-[#1a1a1a] transition-colors cursor-pointer border border-transparent hover:border-white/10"
              >
                <div className={`rounded-md bg-white/5 p-2 ${feature.color}`}>
                  <feature.icon className="h-6 w-6" />
                </div>
                <span className="truncate text-sm font-semibold text-gray-200">
                  {feature.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Workflows Section */}
      <div className="flex-1 px-8 pt-0">
        <div
          className="mb-6 flex w-fit cursor-pointer items-center gap-2 hover:opacity-80"
          onClick={onOpenTemplates}
        >
          <h2 className="text-xl font-semibold text-white">{t("Templates")}</h2>
          <ArrowRight className="h-5 w-5 text-gray-400" />
        </div>

        <p className="text-sm text-gray-400 mb-4">{t("Recommended for you")}</p>
        
        {/* Render the existing list of workflows here */}
        <div className="w-full">
            {children}
        </div>
      </div>
    </div>
  );
};
