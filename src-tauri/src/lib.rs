#[tauri::command]
fn ratatui_runtime_manifest() -> String {
    syndrid_ratatui_runtime::runtime_manifest_json()
}

#[tauri::command]
fn ratatui_runtime_health() -> &'static str {
    // Referencing representative upstream types here makes the desktop binary
    // compile against the same coherent runtime that exported projects use.
    let _ = std::mem::size_of::<syndrid_ratatui_runtime::ratatui::layout::Rect>();
    let _ = std::mem::size_of::<syndrid_ratatui_runtime::ratatui_textarea::TextArea<'static>>();
    let _ = std::mem::size_of::<syndrid_ratatui_runtime::tachyonfx::EffectTimer>();
    "ok"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ratatui_runtime_manifest,
            ratatui_runtime_health,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Syndrid TUI Studio");
}
