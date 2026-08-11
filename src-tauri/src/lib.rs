use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize, PtySystem};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::State;

const MAX_PTY_BUFFER_BYTES: usize = 2 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_BYTES: u64 = 20 * 1024 * 1024;
const MAX_PREVIEW_SPEC_BYTES: usize = 12 * 1024 * 1024;
static PREVIEW_FILE_COUNTER: AtomicU64 = AtomicU64::new(1);

struct PtySession {
    master: Box<dyn MasterPty>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child>,
    output: Arc<Mutex<Vec<u8>>>,
    temporary_files: Vec<PathBuf>,
}

impl PtySession {
    fn cleanup_files(&mut self) {
        for path in self.temporary_files.drain(..) {
            let _ = std::fs::remove_file(path);
        }
    }

    fn terminate(&mut self) {
        let _ = self.child.kill();
        self.cleanup_files();
    }
}

#[derive(Default)]
struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl Drop for PtyManager {
    fn drop(&mut self) {
        if let Ok(sessions) = self.sessions.get_mut() {
            for session in sessions.values_mut() {
                session.terminate();
            }
            sessions.clear();
        }
    }
}

fn command_builder(command: &str) -> CommandBuilder {
    #[cfg(target_os = "windows")]
    {
        let mut builder = CommandBuilder::new("cmd.exe");
        builder.args(["/D", "/S", "/C", command]);
        builder
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut builder = CommandBuilder::new("sh");
        builder.args(["-lc", command]);
        builder
    }
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn image_mime(path: &Path) -> Result<&'static str, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" => Ok("image/png"),
        "jpg" | "jpeg" => Ok("image/jpeg"),
        "gif" => Ok("image/gif"),
        "webp" => Ok("image/webp"),
        "bmp" => Ok("image/bmp"),
        "ico" => Ok("image/x-icon"),
        _ => Err(format!("unsupported preview image extension: {extension}")),
    }
}

fn spawn_pty_session(
    sessions: &mut HashMap<String, PtySession>,
    session_id: String,
    builder: CommandBuilder,
    cols: u16,
    rows: u16,
    temporary_files: Vec<PathBuf>,
) -> Result<(), String> {
    if let Some(mut previous) = sessions.remove(&session_id) {
        previous.terminate();
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(pty_size(cols, rows))
        .map_err(|error| format!("open PTY: {error}"))?;
    let child = pair
        .slave
        .spawn_command(builder)
        .map_err(|error| format!("spawn PTY command: {error}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("clone PTY reader: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("take PTY writer: {error}"))?;
    let output = Arc::new(Mutex::new(Vec::<u8>::new()));
    let reader_output = Arc::clone(&output);
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    if let Ok(mut output) = reader_output.lock() {
                        output.extend_from_slice(&buf[..read]);
                        if output.len() > MAX_PTY_BUFFER_BYTES {
                            let trim = output.len() - MAX_PTY_BUFFER_BYTES;
                            output.drain(..trim);
                        }
                    } else {
                        break;
                    }
                }
            }
        }
    });

    sessions.insert(
        session_id,
        PtySession {
            master: pair.master,
            writer,
            child,
            output,
            temporary_files,
        },
    );
    Ok(())
}

fn user_home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn bridge_token_path() -> Result<PathBuf, String> {
    user_home()
        .map(|home| home.join(".syndrid-tui-studio").join("bridge-token"))
        .ok_or_else(|| "cannot determine user home directory".into())
}

fn preview_sidecar_path() -> Result<PathBuf, String> {
    let extension = if cfg!(target_os = "windows") { ".exe" } else { "" };
    let plain_name = format!("syndrid-tui-preview{extension}");
    let current = std::env::current_exe().map_err(|error| format!("locate Studio executable: {error}"))?;
    if let Some(parent) = current.parent() {
        let sibling = parent.join(&plain_name);
        if sibling.is_file() {
            return Ok(sibling);
        }
        if let Ok(entries) = std::fs::read_dir(parent) {
            if let Some(path) = entries.flatten().map(|entry| entry.path()).find(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.starts_with("syndrid-tui-preview-") && name.ends_with(extension))
                    .unwrap_or(false)
            }) {
                return Ok(path);
            }
        }
    }

    // Development fallback. Tauri bundles strip the target triple, but before
    // `tauri dev` the prepared source sidecar still lives in this directory.
    let dev_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    if let Ok(entries) = std::fs::read_dir(&dev_dir) {
        if let Some(path) = entries.flatten().map(|entry| entry.path()).find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.starts_with("syndrid-tui-preview-") && name.ends_with(extension))
                .unwrap_or(false)
        }) {
            return Ok(path);
        }
    }
    Err(format!("terminal preview sidecar not found near {} or {}", current.display(), dev_dir.display()))
}

fn write_preview_spec(session_id: &str, spec_json: &str) -> Result<PathBuf, String> {
    if spec_json.len() > MAX_PREVIEW_SPEC_BYTES {
        return Err(format!("terminal test spec is too large ({} bytes)", spec_json.len()));
    }
    syndrid_ratatui_runtime::preview::parse_spec(spec_json)
        .map_err(|error| format!("invalid terminal test spec: {error}"))?;
    let safe_id: String = session_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(80)
        .collect();
    let counter = PREVIEW_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "syndrid-tui-preview-{}-{}-{}.json",
        std::process::id(),
        if safe_id.is_empty() { "session" } else { &safe_id },
        counter
    ));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)
        .map_err(|error| format!("create terminal test spec: {error}"))?;
    file.write_all(spec_json.as_bytes())
        .and_then(|_| file.flush())
        .map_err(|error| format!("write terminal test spec: {error}"))?;
    Ok(path)
}

#[tauri::command]
fn ratatui_runtime_manifest() -> String {
    syndrid_ratatui_runtime::runtime_manifest_json()
}

#[tauri::command]
fn ratatui_runtime_health() -> &'static str {
    let _ = std::mem::size_of::<syndrid_ratatui_runtime::ratatui::layout::Rect>();
    let _ = std::mem::size_of::<syndrid_ratatui_runtime::ratatui_textarea::TextArea<'static>>();
    let _ = std::mem::size_of::<syndrid_ratatui_runtime::tachyonfx::EffectTimer>();
    "ok"
}

#[tauri::command]
fn agent_bridge_token() -> Result<String, String> {
    if let Ok(value) = std::env::var("SYNDRID_TUI_BRIDGE_TOKEN") {
        let token = value.trim().to_owned();
        if !token.is_empty() {
            return Ok(token);
        }
    }
    let path = bridge_token_path()?;
    let token = std::fs::read_to_string(&path)
        .map_err(|error| format!("read Studio bridge token {}: {error}", path.display()))?;
    let token = token.trim().to_owned();
    if token.len() < 32 {
        return Err("Studio bridge token is missing or invalid".into());
    }
    Ok(token)
}

#[tauri::command]
fn image_preview_data_uri(path: String) -> Result<String, String> {
    let path = Path::new(path.trim());
    if !path.is_file() {
        return Err(format!("image file not found: {}", path.display()));
    }
    let metadata = std::fs::metadata(path).map_err(|error| format!("read image metadata: {error}"))?;
    if metadata.len() > MAX_IMAGE_PREVIEW_BYTES {
        return Err(format!("image is too large for Studio preview ({} bytes)", metadata.len()));
    }
    let mime = image_mime(path)?;
    let bytes = std::fs::read(path).map_err(|error| format!("read image: {error}"))?;
    Ok(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
}

#[tauri::command]
fn pty_start(
    state: State<'_, PtyManager>,
    session_id: String,
    command: String,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    let session_id = session_id.trim().to_string();
    if session_id.is_empty() {
        return Err("session_id is required".into());
    }
    let command = command.trim().to_string();
    if command.is_empty() {
        return Err("command is required".into());
    }
    let mut builder = command_builder(&command);
    if let Some(cwd) = cwd.as_deref().map(str::trim).filter(|cwd| !cwd.is_empty()) {
        builder.cwd(cwd);
    }
    let mut sessions = state.sessions.lock().map_err(|_| "PTY manager lock poisoned")?;
    spawn_pty_session(
        &mut sessions,
        session_id,
        builder,
        cols.unwrap_or(100),
        rows.unwrap_or(30),
        Vec::new(),
    )
}

#[tauri::command]
fn preview_start(
    state: State<'_, PtyManager>,
    session_id: String,
    spec_json: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session_id = session_id.trim().to_owned();
    if session_id.is_empty() {
        return Err("session_id is required".into());
    }
    let spec_path = write_preview_spec(&session_id, &spec_json)?;
    let sidecar = match preview_sidecar_path() {
        Ok(path) => path,
        Err(error) => {
            let _ = std::fs::remove_file(&spec_path);
            return Err(error);
        }
    };
    let mut builder = CommandBuilder::new(&sidecar);
    builder.arg(&spec_path);
    let mut sessions = state.sessions.lock().map_err(|_| "PTY manager lock poisoned")?;
    let result = spawn_pty_session(
        &mut sessions,
        session_id,
        builder,
        cols,
        rows,
        vec![spec_path.clone()],
    );
    if result.is_err() {
        let _ = std::fs::remove_file(spec_path);
    }
    result
}

#[tauri::command]
fn pty_read(state: State<'_, PtyManager>, session_id: String) -> Result<String, String> {
    let sessions = state.sessions.lock().map_err(|_| "PTY manager lock poisoned")?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("unknown PTY session: {session_id}"))?;
    let mut output = session.output.lock().map_err(|_| "PTY output lock poisoned")?;
    if output.is_empty() {
        return Ok(String::new());
    }
    let bytes = std::mem::take(&mut *output);
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
fn pty_write(state: State<'_, PtyManager>, session_id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|_| "PTY manager lock poisoned")?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("unknown PTY session: {session_id}"))?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|error| format!("write PTY: {error}"))
}

#[tauri::command]
fn pty_resize(state: State<'_, PtyManager>, session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|_| "PTY manager lock poisoned")?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("unknown PTY session: {session_id}"))?;
    session
        .master
        .resize(pty_size(cols, rows))
        .map_err(|error| format!("resize PTY: {error}"))
}

#[tauri::command]
fn pty_status(state: State<'_, PtyManager>, session_id: String) -> Result<String, String> {
    let mut sessions = state.sessions.lock().map_err(|_| "PTY manager lock poisoned")?;
    let status = {
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| format!("unknown PTY session: {session_id}"))?;
        session
            .child
            .try_wait()
            .map_err(|error| format!("poll PTY child: {error}"))?
    };
    if let Some(status) = status {
        if let Some(mut session) = sessions.remove(&session_id) {
            session.cleanup_files();
        }
        Ok(format!("exited:{status:?}"))
    } else {
        Ok("running".into())
    }
}

#[tauri::command]
fn pty_stop(state: State<'_, PtyManager>, session_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|_| "PTY manager lock poisoned")?;
    if let Some(mut session) = sessions.remove(&session_id) {
        session.terminate();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PtyManager::default())
        .invoke_handler(tauri::generate_handler![
            ratatui_runtime_manifest,
            ratatui_runtime_health,
            agent_bridge_token,
            image_preview_data_uri,
            pty_start,
            preview_start,
            pty_read,
            pty_write,
            pty_resize,
            pty_status,
            pty_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Syndrid TUI Studio");
}
