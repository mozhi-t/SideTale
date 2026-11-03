mod books;
mod privacy;

use books::{BookDetail, BookMeta, ChapterPayload, NewBook, Store};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// 关闭 Windows 的窗口显示/隐藏过渡动画，让快捷键切换小窗时立即出现或消失
#[cfg(target_os = "windows")]
fn disable_window_transitions(window: &tauri::WebviewWindow) {
    // DWMWA_TRANSITIONS_FORCEDISABLED = 3
    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut core::ffi::c_void,
            attribute: u32,
            value: *const core::ffi::c_void,
            size: u32,
        ) -> i32;
    }

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let disabled: i32 = 1;
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd.0,
            3,
            &disabled as *const i32 as *const core::ffi::c_void,
            std::mem::size_of::<i32>() as u32,
        );
    }
}

#[tauri::command]
fn list_books(store: State<'_, Store>) -> Result<Vec<BookMeta>, String> {
    store.list_books()
}

#[tauri::command]
fn import_text_book(path: String, store: State<'_, Store>) -> Result<BookMeta, String> {
    store.import_text(&path)
}

#[tauri::command]
fn save_parsed_book(payload: NewBook, store: State<'_, Store>) -> Result<BookMeta, String> {
    store.save_new_book(payload)
}

#[tauri::command]
fn get_book_detail(id: String, store: State<'_, Store>) -> Result<BookDetail, String> {
    store.get_detail(&id)
}

#[tauri::command]
fn get_chapter(id: String, index: usize, store: State<'_, Store>) -> Result<ChapterPayload, String> {
    store.get_chapter(&id, index)
}

#[tauri::command]
fn delete_book(id: String, store: State<'_, Store>) -> Result<(), String> {
    store.delete_book(&id)
}

#[tauri::command]
fn save_read_progress(
    id: String,
    chapter: usize,
    progress: f64,
    store: State<'_, Store>,
) -> Result<(), String> {
    store.update_progress(&id, chapter, progress)
}

/// 读取任意文件并返回 Base64，供前端解析 EPUB
#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;

    let metadata = std::fs::metadata(&path).map_err(|error| format!("无法读取文件: {error}"))?;
    if metadata.len() > 128 * 1024 * 1024 {
        return Err("文件过大（超过 128MB）".to_string());
    }
    let bytes = std::fs::read(&path).map_err(|error| format!("无法读取文件: {error}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn set_privacy_protection(enabled: bool, app: AppHandle) -> Result<(), String> {
    privacy::apply(&app, enabled)
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_mini(app: &AppHandle) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    static PLACED: AtomicBool = AtomicBool::new(false);

    let window = app
        .get_webview_window("mini")
        .ok_or_else(|| "小窗尚未创建".to_string())?;

    // 首次打开时把小窗放到屏幕右下角，避开任务栏
    if !PLACED.swap(true, Ordering::SeqCst) {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let scale = monitor.scale_factor();
            let monitor_size = monitor.size();
            let monitor_position = monitor.position();
            let window_size = window
                .outer_size()
                .unwrap_or(tauri::PhysicalSize::new(400, 340));
            let margin = (24.0 * scale).round() as i32;
            let taskbar = (64.0 * scale).round() as i32;
            let x = monitor_position.x + monitor_size.width as i32
                - window_size.width as i32
                - margin;
            let y = monitor_position.y + monitor_size.height as i32
                - window_size.height as i32
                - margin
                - taskbar;
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        }
    }

    window.show().map_err(|error| error.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn show_mini_window(app: AppHandle) -> Result<(), String> {
    show_mini(&app)
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_main = MenuItem::with_id(app, "show-main", "显示主窗口", true, None::<&str>)?;
    let show_mini_item =
        MenuItem::with_id(app, "show-mini", "打开小窗", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 SideTale", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_main, &show_mini_item, &quit])?;

    let mut builder = TrayIconBuilder::with_id("sidetale-tray")
        .tooltip("SideTale 小说阅读器")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show-main" => show_main_window(app),
            "show-mini" => {
                let _ = show_mini(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

/// Windows 11 默认会把新应用的托盘图标放进「隐藏的图标」里，
/// 这里把当前程序的托盘图标标记为常驻显示，方便关闭主窗口后从托盘重新打开。
#[cfg(target_os = "windows")]
fn promote_tray_icon() {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    let Ok(current_exe) = std::env::current_exe() else {
        return;
    };
    let Some(current_exe) = current_exe.to_str() else {
        return;
    };
    let Ok(root) = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(r"Control Panel\NotifyIconSettings", KEY_READ)
    else {
        return;
    };

    for name in root.enum_keys().flatten() {
        let Ok(key) = root.open_subkey_with_flags(&name, KEY_READ | KEY_WRITE) else {
            continue;
        };
        let Ok(executable) = key.get_value::<String, _>("ExecutablePath") else {
            continue;
        };
        if executable.eq_ignore_ascii_case(current_exe) {
            let _ = key.set_value("IsPromoted", &1u32);
        }
    }
}

#[tauri::command]
fn hide_mini_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("mini")
        .ok_or_else(|| "小窗尚未创建".to_string())?;
    window.hide().map_err(|error| error.to_string())
}

/// 当前注册的显示 / 隐藏小窗全局热键
#[derive(Default)]
struct MiniHotkeys(Mutex<(Option<Shortcut>, Option<Shortcut>)>);

fn parse_code(token: &str) -> Option<Code> {
    let lower = token.to_ascii_lowercase();
    if lower.len() == 1 {
        return match lower.chars().next()? {
            '0' => Some(Code::Digit0),
            '1' => Some(Code::Digit1),
            '2' => Some(Code::Digit2),
            '3' => Some(Code::Digit3),
            '4' => Some(Code::Digit4),
            '5' => Some(Code::Digit5),
            '6' => Some(Code::Digit6),
            '7' => Some(Code::Digit7),
            '8' => Some(Code::Digit8),
            '9' => Some(Code::Digit9),
            'a' => Some(Code::KeyA),
            'b' => Some(Code::KeyB),
            'c' => Some(Code::KeyC),
            'd' => Some(Code::KeyD),
            'e' => Some(Code::KeyE),
            'f' => Some(Code::KeyF),
            'g' => Some(Code::KeyG),
            'h' => Some(Code::KeyH),
            'i' => Some(Code::KeyI),
            'j' => Some(Code::KeyJ),
            'k' => Some(Code::KeyK),
            'l' => Some(Code::KeyL),
            'm' => Some(Code::KeyM),
            'n' => Some(Code::KeyN),
            'o' => Some(Code::KeyO),
            'p' => Some(Code::KeyP),
            'q' => Some(Code::KeyQ),
            'r' => Some(Code::KeyR),
            's' => Some(Code::KeyS),
            't' => Some(Code::KeyT),
            'u' => Some(Code::KeyU),
            'v' => Some(Code::KeyV),
            'w' => Some(Code::KeyW),
            'x' => Some(Code::KeyX),
            'y' => Some(Code::KeyY),
            'z' => Some(Code::KeyZ),
            _ => None,
        };
    }

    Some(match lower.as_str() {
        "f1" => Code::F1,
        "f2" => Code::F2,
        "f3" => Code::F3,
        "f4" => Code::F4,
        "f5" => Code::F5,
        "f6" => Code::F6,
        "f7" => Code::F7,
        "f8" => Code::F8,
        "f9" => Code::F9,
        "f10" => Code::F10,
        "f11" => Code::F11,
        "f12" => Code::F12,
        "space" => Code::Space,
        "arrowleft" => Code::ArrowLeft,
        "arrowright" => Code::ArrowRight,
        "arrowup" => Code::ArrowUp,
        "arrowdown" => Code::ArrowDown,
        "escape" | "esc" => Code::Escape,
        "enter" | "return" => Code::Enter,
        "tab" => Code::Tab,
        "backspace" => Code::Backspace,
        "delete" => Code::Delete,
        "home" => Code::Home,
        "end" => Code::End,
        "pageup" => Code::PageUp,
        "pagedown" => Code::PageDown,
        _ => return None,
    })
}

fn parse_shortcut(value: &str) -> Result<Shortcut, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("快捷键不能为空".to_string());
    }

    let tokens: Vec<&str> = if trimmed == " " {
        vec!["Space"]
    } else {
        trimmed.split('+').map(str::trim).filter(|token| !token.is_empty()).collect()
    };

    let mut modifiers = Modifiers::empty();
    let mut code: Option<Code> = None;
    for token in tokens {
        match token.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "shift" => modifiers |= Modifiers::SHIFT,
            "alt" | "option" => modifiers |= Modifiers::ALT,
            "meta" | "super" | "cmd" | "win" => modifiers |= Modifiers::SUPER,
            _ => {
                if code.is_some() {
                    return Err(format!("快捷键只能包含一个按键：{value}"));
                }
                code = Some(parse_code(token).ok_or_else(|| format!("不支持的快捷键按键：{token}"))?);
            }
        }
    }

    let code = code.ok_or_else(|| format!("快捷键缺少按键：{value}"))?;
    let modifiers = (!modifiers.is_empty()).then_some(modifiers);
    Ok(Shortcut::new(modifiers, code))
}

/// 同步显示 / 隐藏小窗的全局热键，窗口失去焦点后依然可用
#[tauri::command]
fn set_mini_hotkeys(show: String, hide: String, app: AppHandle) -> Result<(), String> {
    let show_shortcut = parse_shortcut(&show).map_err(|error| format!("显示小窗{error}"))?;
    let hide_shortcut = parse_shortcut(&hide).map_err(|error| format!("隐藏小窗{error}"))?;
    if show_shortcut == hide_shortcut {
        return Err("显示与隐藏小窗的快捷键不能相同".to_string());
    }

    let state = app.state::<MiniHotkeys>();
    // 整个替换过程持有锁，避免多个前端请求并发时重复注册同一热键
    let mut current = state.0.lock().map_err(|_| "快捷键状态异常".to_string())?;
    let previous = current.clone();
    for shortcut in [current.0.take(), current.1.take()].into_iter().flatten() {
        let _ = app.global_shortcut().unregister(shortcut);
    }

    let registered = (|| -> Result<(), String> {
        app.global_shortcut()
            .register(show_shortcut)
            .map_err(|error| format!("注册显示小窗快捷键失败：{error}"))?;
        app.global_shortcut().register(hide_shortcut).map_err(|error| {
            let _ = app.global_shortcut().unregister(show_shortcut);
            format!("注册隐藏小窗快捷键失败：{error}")
        })
    })();

    match registered {
        Ok(()) => {
            current.0 = Some(show_shortcut);
            current.1 = Some(hide_shortcut);
            Ok(())
        }
        Err(error) => {
            // 注册失败时恢复之前的快捷键，避免用户原来的快捷键也失效
            if let Some(old_show) = previous.0 {
                let _ = app.global_shortcut().register(old_show);
                current.0 = Some(old_show);
            }
            if let Some(old_hide) = previous.1 {
                let _ = app.global_shortcut().register(old_hide);
                current.1 = Some(old_hide);
            }
            Err(error)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    let (show, hide) = {
                        let state = app.state::<MiniHotkeys>();
                        let Ok(current) = state.0.lock() else {
                            return;
                        };
                        (current.0.clone(), current.1.clone())
                    };
                    if show.as_ref() == Some(shortcut) {
                        let _ = show_mini(app);
                    } else if hide.as_ref() == Some(shortcut) {
                        if let Some(window) = app.get_webview_window("mini") {
                            let _ = window.hide();
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let store = Store::new(root).map_err(std::io::Error::other)?;
            app.manage(store);
            app.manage(MiniHotkeys::default());

            // 关闭主窗口与小窗的系统显示/隐藏动画
            #[cfg(target_os = "windows")]
            for label in ["main", "mini"] {
                if let Some(window) = app.get_webview_window(label) {
                    disable_window_transitions(&window);
                }
            }

            setup_tray(app)?;

            // 托盘图标注册到系统后，再把它固定到任务栏通知区域
            #[cfg(target_os = "windows")]
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_secs(2));
                promote_tray_icon();
            });

            // 关闭主窗口时隐藏到系统托盘，而不是退出应用
            if let Some(main) = app.get_webview_window("main") {
                let main_window = main.clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = main_window.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_books,
            import_text_book,
            save_parsed_book,
            get_book_detail,
            get_chapter,
            delete_book,
            save_read_progress,
            read_file_base64,
            set_privacy_protection,
            show_mini_window,
            hide_mini_window,
            set_mini_hotkeys
        ])
        .run(tauri::generate_context!())
        .expect("error while running SideTale");
}
