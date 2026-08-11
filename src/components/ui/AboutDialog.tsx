import { X } from "lucide-react";
import logo from "../../assets/logo.png";

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-white/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div 
        className="relative bg-white w-[340px] rounded-2xl shadow-[0_20px_60px_rgb(0,0,0,0.15)] flex flex-col items-center pt-10 pb-8 px-8 animate-in zoom-in-95 duration-200 border border-black/5 text-[var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-5 drop-shadow-2xl">
          <img src={logo} alt="SkillHub Logo" className="w-24 h-24 object-contain" />
        </div>
        
        <h2 className="text-[28px] font-semibold mb-1 tracking-tight">SkillHub</h2>
        <p className="text-[13px] text-[var(--color-muted)] mb-6 font-medium">
          个人技能与 Prompt 管理枢纽
        </p>

        <div className="text-[12px] text-black/30 mb-8 font-mono tracking-wide">
          1.0.0 Build01 (20260807)
        </div>

        <button 
          onClick={onClose}
          className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-[14px] font-medium rounded-lg transition-colors mb-5 shadow-sm"
        >
          确认
        </button>

        <div className="text-[11px] text-black/20 tracking-widest font-medium">
          Copyright © 2024-2026 SkillHub
        </div>
      </div>
    </div>
  );
}
