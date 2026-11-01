use tauri::{AppHandle, Manager};

/// 对所有已创建的窗口应用 / 取消防截屏（Windows: SetWindowDisplayAffinity）
pub fn apply(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let mut errors: Vec<String> = Vec::new();
    for (label, window) in app.webview_windows() {
        match apply_window(&window, enabled) {
            Ok(()) => {}
            Err(error) => errors.push(format!("{label}: {error}")),
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("；"))
    }
}

#[cfg(target_os = "windows")]
fn apply_window(window: &tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    // WDA_NONE = 0x00000000, WDA_EXCLUDEFROMCAPTURE = 0x00000011
    const WDA_NONE: u32 = 0x0000_0000;
    const WDA_EXCLUDEFROMCAPTURE: u32 = 0x0000_0011;

    #[link(name = "user32")]
    extern "system" {
        fn SetWindowDisplayAffinity(hwnd: *mut core::ffi::c_void, affinity: u32) -> i32;
    }

    let handle = window
        .window_handle()
        .map_err(|error| format!("无法获取窗口句柄: {error}"))?
        .as_raw();
    let RawWindowHandle::Win32(win32) = handle else {
        return Err("窗口句柄不是 Win32 句柄".to_string());
    };

    let affinity = if enabled {
        WDA_EXCLUDEFROMCAPTURE
    } else {
        WDA_NONE
    };
    let ok = unsafe {
        SetWindowDisplayAffinity(win32.hwnd.get() as *mut core::ffi::c_void, affinity)
    };
    if ok != 0 {
        Ok(())
    } else {
        Err("系统拒绝了防截屏设置（需 Windows 10 2004 及以上版本）".to_string())
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_window(_window: &tauri::WebviewWindow, _enabled: bool) -> Result<(), String> {
    Err("防截屏功能仅在 Windows 上可用".to_string())
}
