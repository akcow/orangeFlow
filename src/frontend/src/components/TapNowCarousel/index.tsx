import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Layers, Play, Star, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CarouselSlide {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  bgImage: string;
}

const slides: CarouselSlide[] = [
  {
    id: 1,
    title: "Vidu Q3 Video Model Is Live",
    description: "Generate 16s multi-shot narrative videos with multilingual support.",
    icon: <Video className="w-12 h-12 text-white" />,
    gradient: "from-blue-600 to-purple-600",
    bgImage: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop"
  },
  {
    id: 2,
    title: "Cinema Lab Features Are Here",
    description: "Create professional film-style content with ease.",
    icon: <Play className="w-12 h-12 text-white" />,
    gradient: "from-orange-600 to-red-600",
    bgImage: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2525&auto=format&fit=crop"
  },
  {
    id: 3,
    title: "Create Together",
    description: "The creator program is open. Build and share with the community.",
    icon: <Star className="w-12 h-12 text-white" />,
    gradient: "from-green-600 to-teal-600",
    bgImage: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=2671&auto=format&fit=crop"
  },
  {
    id: 4,
    title: "AI Image Generation",
    description: "Unleash your imagination with one-click image creation.",
    icon: <ImageIcon className="w-12 h-12 text-white" />,
    gradient: "from-pink-600 to-rose-600",
    bgImage: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2670&auto=format&fit=crop"
  },
  {
    id: 5,
    title: "Smart Workflows",
    description: "Automate your daily tasks with AI workflows.",
    icon: <Layers className="w-12 h-12 text-white" />,
    gradient: "from-indigo-600 to-blue-600",
    bgImage: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2670&auto=format&fit=crop"
  },
];

export default function TapNowCarousel() {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const visibleCount = 3;
  const totalSlides = slides.length;

  useEffect(() => {
    const timer = setInterval(() => {
      next();
    }, 5000);
    return () => clearInterval(timer);
  }, [currentIndex]);

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % totalSlides);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  // Create a circular list of slides for rendering
  const getVisibleSlides = (): CarouselSlide[] => {
    const items: CarouselSlide[] = [];
    for (let i = 0; i < visibleCount; i++) {
      const index = (currentIndex + i) % totalSlides;
      items.push(slides[index]);
    }
    return items;
  };

  return (
    <div className="relative w-full overflow-hidden mb-6 group select-none">
      <div className="grid grid-cols-3 gap-4">
        {getVisibleSlides().map((slide, idx) => (
          <div 
            key={`${slide.id}-${idx}`} 
            className="relative h-48 md:h-56 rounded-xl overflow-hidden shadow-lg border border-white/10 group/card transition-all hover:scale-[1.02] duration-300"
          >
            {/* Background Image */}
            <div 
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover/card:scale-110"
              style={{ backgroundImage: `url(${slide.bgImage})` }}
            />
            
            {/* Overlay Gradient */}
            <div className={`absolute inset-0 bg-gradient-to-t ${slide.gradient} opacity-80 mix-blend-multiply`} />
            <div className="absolute inset-0 bg-black/20" />

            {/* Content */}
            <div className="relative z-10 p-6 h-full flex flex-col justify-between text-white">
              <div className="flex items-start justify-between">
                <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md">
                   {slide.icon}
                </div>
                {idx === 0 && (
                   <span className="text-xs font-bold bg-white text-black px-2 py-1 rounded-full">
                     NEW
                   </span>
                )}
              </div>
              
              <div>
                <h3 className="text-xl font-bold mb-2 leading-tight line-clamp-2">{t(slide.title)}</h3>
                <p className="text-white/80 text-xs md:text-sm line-clamp-2">{t(slide.description)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Buttons */}
      <button 
        onClick={prev} 
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 group-hover:translate-x-2 z-20 border border-white/10"
      >
        <ChevronLeft size={24} />
      </button>
      <button 
        onClick={next} 
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 group-hover:-translate-x-2 z-20 border border-white/10"
      >
        <ChevronRight size={24} />
      </button>
    </div>
  );
}
