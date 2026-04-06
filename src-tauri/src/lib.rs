mod commands;
mod midi;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_file,
            commands::load_file,
            midi::midi_list_inputs,
            midi::midi_connect,
            midi::midi_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
