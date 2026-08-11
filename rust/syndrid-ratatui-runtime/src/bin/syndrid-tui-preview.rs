use std::{io, path::PathBuf};

fn main() -> io::Result<()> {
    let path = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "expected terminal test spec path",
            )
        })?;
    syndrid_ratatui_runtime::preview::run_from_file(path)
}
