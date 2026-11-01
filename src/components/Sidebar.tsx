import type { LucideIcon } from "lucide-react";
import { BookOpen, Coffee, Library, Settings, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@heroui/react";

export type Page = "library" | "reader" | "settings";

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavItem({ icon: Icon, label, active, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition-all ${
        active
          ? "bg-[#2b2a24] text-[#f6f4ef] shadow-[0_4px_14px_-4px_rgba(43,42,36,0.45)]"
          : "text-[#6f6b61] hover:bg-black/[0.05] hover:text-[#2b2a24]"
      }`}
    >
      <Icon className="size-[17px] shrink-0" strokeWidth={1.8} />
      <span className="flex-1 font-medium">{label}</span>
    </button>
  );
}

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  onOpenMini: () => void;
  privacyEnabled: boolean;
  hasBook: boolean;
}

export function Sidebar({ page, onNavigate, onOpenMini, privacyEnabled, hasBook }: SidebarProps) {
  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-black/[0.06] bg-[#efece5] px-4 pb-5 pt-6">
      <div className="flex items-center gap-2.5 px-1 pb-7">
        <div className="grid size-9 place-items-center rounded-xl bg-[#2b2a24] font-serif text-[17px] text-[#f6f4ef] shadow-sm">
          S
        </div>
        <div className="leading-tight">
          <div className="font-serif text-[17px] tracking-wide text-[#2b2a24]">SideTale</div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-[#a09b8f]">quiet reading</div>
        </div>
      </div>

      <div className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[#a8a396]">
        阅读空间
      </div>
      <nav className="flex flex-col gap-1">
        <NavItem
          icon={Library}
          label="书库"
          active={page === "library"}
          onClick={() => onNavigate("library")}
        />
        <NavItem
          icon={BookOpen}
          label="阅读"
          active={page === "reader"}
          onClick={() => onNavigate("reader")}
        />
        <NavItem
          icon={Settings}
          label="设置"
          active={page === "settings"}
          onClick={() => onNavigate("settings")}
        />
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onNavigate("settings")}
          className="rounded-2xl border border-black/[0.06] bg-white/60 p-3 text-left transition-colors hover:bg-white/85"
        >
          <div className="flex items-center gap-2 text-[12px] font-medium text-[#2b2a24]">
            {privacyEnabled ? (
              <ShieldCheck className="size-4 text-emerald-700" strokeWidth={1.9} />
            ) : (
              <ShieldAlert className="size-4 text-[#a5865c]" strokeWidth={1.9} />
            )}
            <span className="flex-1">隐私保护</span>
            <span className="text-[10px] text-[#9c978b]">
              {privacyEnabled ? "已开启" : "未开启"}
            </span>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#8a867c]">
            开启后，其他软件的截屏 / 录屏无法捕获本应用窗口。
          </p>
        </button>

        <div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onPress={onOpenMini}
            isDisabled={!hasBook}
          >
            <Coffee className="size-4" strokeWidth={1.8} />
            打开小窗
          </Button>
          <p className="mt-2 px-1 text-[10px] leading-relaxed text-[#a09b8f]">
            小窗始终置顶，可随时调整背景与文字透明度。
          </p>
        </div>
      </div>
    </aside>
  );
}
