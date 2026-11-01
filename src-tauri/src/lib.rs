mod books;
mod privacy;

use books::{BookDetail, BookMeta, ChapterPayload, NewBook, Store};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WindowEvent};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let store = Store::new(root).map_err(std::io::Error::other)?;
            app.manage(store);
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
            hide_mini_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running SideTale");
}
