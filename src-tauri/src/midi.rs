use midir::{MidiInput, MidiInputConnection};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static CONNECTION: Mutex<Option<MidiInputConnection<()>>> = Mutex::new(None);

#[derive(Clone, Serialize)]
pub struct MidiMessage {
    pub status: u8,
    pub note: u8,
    pub velocity: u8,
}

#[tauri::command]
pub fn midi_list_inputs() -> Result<Vec<String>, String> {
    let midi_in = MidiInput::new("nubium-list").map_err(|e| e.to_string())?;
    let ports = midi_in.ports();
    let names: Vec<String> = ports
        .iter()
        .filter_map(|p| midi_in.port_name(p).ok())
        .collect();
    Ok(names)
}

#[tauri::command]
pub fn midi_connect(app: AppHandle, port_index: usize) -> Result<(), String> {
    // Disconnect existing
    midi_disconnect();

    let midi_in = MidiInput::new("nubium-input").map_err(|e| e.to_string())?;
    let ports = midi_in.ports();
    let port = ports.get(port_index).ok_or("Invalid port index")?;

    let conn = midi_in
        .connect(
            port,
            "nubium-midi",
            move |_timestamp, data, _| {
                if data.len() >= 3 {
                    let msg = MidiMessage {
                        status: data[0],
                        note: data[1],
                        velocity: data[2],
                    };
                    let _ = app.emit("midi-message", msg);
                }
            },
            (),
        )
        .map_err(|e| e.to_string())?;

    *CONNECTION.lock().unwrap() = Some(conn);
    Ok(())
}

#[tauri::command]
pub fn midi_disconnect() {
    let mut conn = CONNECTION.lock().unwrap();
    if let Some(c) = conn.take() {
        c.close();
    }
}
