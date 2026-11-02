import { useEffect, useState } from "react";
import { Label, Slider, Switch } from "@heroui/react";
import { ShieldCheck, Sparkles } from "lucide-react";

import {
  TEXT_COLOR_PRESETS,
  colorWithAlpha,
  updateSettings,
  useSettings,
} from "../lib/settings";

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

function displayKeyName(key: string): string {
  const labels: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    " ": "空格",
    Space: "空格",
    Escape: "Esc",
    Enter: "Enter",
    Tab: "Tab",
  };
  return labels[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

function KeyCapture({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (key: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;

    const handleKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setCapturing(false);
        return;
      }
      if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;

      onChange(event.key);
      setCapturing(false);
    };

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [capturing, onChange]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.08] bg-white/80 px-4 py-3">
      <span className="text-[12.5px] text-[#4f4b43]">{label}</span>
      <button
        type="button"
        onClick={() => setCapturing((previous) => !previous)}
        className={`min-w-[68px] rounded-lg border px-3 py-1.5 text-[12px] tabular-nums transition-colors ${
          capturing
            ? "border-[#2b2a24] bg-[#2b2a24] text-white"
            : "border-black/[0.1] bg-white text-[#2b2a24] hover:border-black/20"
        }`}
      >
        {capturing ? "按下按键…" : displayKeyName(value)}
      </button>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, format, onChange }: SliderRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-[#4f4b43]">{label}</span>
        <span className="text-[11px] tabular-nums text-[#9c978b]">{format(value)}</span>
      </div>
      <Slider
        value={value}
        minValue={min}
        maxValue={max}
        step={step}
        onChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? value) : next)}
        className="mt-1.5 w-full"
      >
        <Label className="sr-only">{label}</Label>
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
    </div>
  );
}

interface SettingsPageProps {
  privacyError: string | null;
}

export function SettingsPage({ privacyError }: SettingsPageProps) {
  const settings = useSettings();
  const bgColor = `rgba(58, 59, 64, ${settings.miniBgOpacity})`;
  const textColor = colorWithAlpha(settings.miniTextColor, settings.miniTextOpacity);
  const frameColor = colorWithAlpha(settings.miniTextColor, 0.1 * settings.miniBgOpacity);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="px-9 pb-6 pt-8">
        <h1 className="font-serif text-[26px] tracking-[0.02em] text-[#2b2a24]">设置</h1>
        <p className="mt-1.5 text-[12px] text-[#8a867c]">
          所有设置即时生效，并会自动同步到小窗。
        </p>
      </header>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-9 pb-10">
        <div className="max-w-[700px] space-y-5">
          <section className="rounded-3xl border border-black/[0.06] bg-white/70 p-6">
            <Switch
              aria-label="开启隐私保护"
              isSelected={settings.privacyProtection}
              onChange={(selected: boolean) =>
                updateSettings({ privacyProtection: selected })
              }
              className="w-full"
            >
              <Switch.Content className="w-full items-start justify-between gap-6 text-left">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[14px] font-medium text-[#2b2a24]">
                    <ShieldCheck className="size-4 shrink-0 text-emerald-700" strokeWidth={1.9} />
                    开启隐私保护（防截屏）
                  </span>
                  <span className="mt-2 block max-w-[430px] text-[12px] font-normal leading-relaxed text-[#8a867c]">
                    开启后，其他软件的截屏与录屏无法捕获 SideTale 窗口。
                  </span>
                </span>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
            {privacyError && (
              <p className="mt-3 rounded-xl border border-red-200/70 bg-red-50 px-3 py-2 text-[11.5px] leading-relaxed text-red-700">
                防截屏设置失败：{privacyError}
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-black/[0.06] bg-white/70 p-6">
            <div className="flex items-center gap-2 text-[14px] font-medium text-[#2b2a24]">
              <Sparkles className="size-4 text-[#8a7a5f]" strokeWidth={1.9} />
              小窗外观
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[#8a867c]">
              小窗使用灰色微圆角背景，下面两项只影响小窗，调节后实时预览。
            </p>

            <div
              className="mt-5 flex h-[180px] items-center justify-center rounded-2xl border border-black/[0.05] bg-[#e7e4dd]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.55), transparent 55%), radial-gradient(circle at 80% 80%, rgba(190,184,170,0.55), transparent 55%)",
              }}
            >
              <div
                className="w-[260px] overflow-hidden rounded-[14px] border shadow-[0_16px_32px_-18px_rgba(0,0,0,0.55)]"
                style={{
                  backgroundColor: bgColor,
                  borderColor: frameColor,
                }}
              >
                <div
                  className="flex items-center gap-1.5 border-b px-3 py-2"
                  style={{
                    borderColor: colorWithAlpha(
                      settings.miniTextColor,
                      0.08 * settings.miniBgOpacity,
                    ),
                  }}
                >
                  <span
                    className="truncate text-[10.5px]"
                    style={{ color: textColor, opacity: 0.65 }}
                  >
                    第 12 章 · 雨夜的来客
                  </span>
                </div>
                <div className="space-y-1 px-3 py-2.5">
                  {[
                    "窗外雨声渐密，他合上手里的书，",
                    "抬头看了一眼墙上的钟。",
                  ].map((line) => (
                    <p key={line} className="text-[10.5px] leading-[1.9]" style={{ color: textColor }}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <SliderRow
                  label="背景透明度"
                  value={settings.miniBgOpacity}
                  min={0}
                  max={1}
                  step={0.01}
                  format={(value) => `${Math.round(value * 100)}%`}
                  onChange={(value) => updateSettings({ miniBgOpacity: value })}
                />
                <p className="mt-2 text-[10.5px] leading-relaxed text-[#a09b8f]">
                  只改变灰色背景，不影响文字；调到 0% 时背景完全透明。
                </p>
              </div>
              <div>
                <SliderRow
                  label="文字透明度"
                  value={settings.miniTextOpacity}
                  min={0.35}
                  max={1}
                  step={0.01}
                  format={(value) => `${Math.round(value * 100)}%`}
                  onChange={(value) => updateSettings({ miniTextOpacity: value })}
                />
                <p className="mt-2 text-[10.5px] leading-relaxed text-[#a09b8f]">
                  只改变正文颜色深浅，与背景设置互不影响。
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-[#4f4b43]">文字颜色</span>
                  <span className="text-[11px] uppercase tabular-nums text-[#9c978b]">
                    {settings.miniTextColor}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {TEXT_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      title={preset.label}
                      aria-label={`文字颜色 ${preset.label}`}
                      onClick={() => updateSettings({ miniTextColor: preset.value })}
                      className={`size-7 rounded-lg border border-black/10 transition ${
                        settings.miniTextColor === preset.value
                          ? "ring-2 ring-[#2b2a24] ring-offset-2 ring-offset-white"
                          : ""
                      }`}
                      style={{ backgroundColor: preset.value }}
                    />
                  ))}
                  <div className="ml-2 flex items-center gap-2">
                    <span className="text-[11px] text-[#9c978b]">自定义</span>
                    <input
                      type="color"
                      aria-label="自定义文字颜色"
                      className="color-swatch size-7 cursor-pointer"
                      value={settings.miniTextColor}
                      onChange={(event) =>
                        updateSettings({ miniTextColor: event.target.value })
                      }
                    />
                  </div>
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-[#a09b8f]">
                  文字颜色只影响小窗文字，背景透明度与文字透明度仍各自独立生效。
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-black/[0.06] bg-white/70 p-6">
            <div className="text-[14px] font-medium text-[#2b2a24]">阅读排版</div>
            <p className="mt-2 text-[12px] leading-relaxed text-[#8a867c]">
              主窗口正文字号与行距，小窗字号会在此基础上略微收窄。
            </p>
            <div className="mt-5 space-y-5">
              <SliderRow
                label="正文字号"
                value={settings.fontSize}
                min={14}
                max={24}
                step={1}
                format={(value) => `${value} px`}
                onChange={(value) => updateSettings({ fontSize: value })}
              />
              <SliderRow
                label="行间距"
                value={settings.lineHeight}
                min={1.4}
                max={2.6}
                step={0.05}
                format={(value) => value.toFixed(2)}
                onChange={(value) => updateSettings({ lineHeight: value })}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-black/[0.06] bg-white/70 p-6">
            <div className="text-[14px] font-medium text-[#2b2a24]">快捷键</div>
            <p className="mt-2 text-[12px] leading-relaxed text-[#8a867c]">
              在主窗口阅读页和小窗中生效，默认上一章 1、下一章 2、显示小窗 3、隐藏小窗 4。
              点击按键后直接按下想使用的键即可修改。
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <KeyCapture
                label="上一章"
                value={settings.prevChapterKey}
                onChange={(key) => updateSettings({ prevChapterKey: key })}
              />
              <KeyCapture
                label="下一章"
                value={settings.nextChapterKey}
                onChange={(key) => updateSettings({ nextChapterKey: key })}
              />
              <KeyCapture
                label="显示小窗"
                value={settings.showMiniKey}
                onChange={(key) => updateSettings({ showMiniKey: key })}
              />
              <KeyCapture
                label="隐藏小窗"
                value={settings.hideMiniKey}
                onChange={(key) => updateSettings({ hideMiniKey: key })}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
