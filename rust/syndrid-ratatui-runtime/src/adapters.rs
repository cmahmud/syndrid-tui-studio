//! Concrete state/adapter factories used by generated Syndrid Ratatui projects.
//!
//! The goal of this module is to exercise upstream APIs in CI and give the
//! exporter a stable, small integration surface instead of teaching generated
//! projects the details of every community crate.

use ansi_to_tui::IntoText as _;
use ratatui::text::Text;
use ratatui_image::picker::Picker;
use ratatui_textarea::TextArea;
use tui_widgets::scrollview::ScrollViewState;

/// Build an owned, stateful multiline editor from portable `.tui` text.
pub fn textarea_from_text(value: &str) -> TextArea<'static> {
    TextArea::from(value.lines().map(ToOwned::to_owned))
}

/// Convert cached ANSI terminal output into styled Ratatui text.
pub fn ansi_text(value: &str) -> Result<Text<'static>, ansi_to_tui::Error> {
    value.into_text()
}

/// Deterministic image picker that works without terminal capability probing.
///
/// Production apps should prefer terminal protocol detection when they own a
/// real TTY; this half-block picker is the safe preview/test fallback.
pub fn halfblock_image_picker() -> Picker {
    Picker::halfblocks()
}

/// Create state for a `tui-widgets`/`tui-scrollview` surface.
pub fn scrollview_state() -> ScrollViewState {
    ScrollViewState::default()
}

#[cfg(feature = "advanced")]
/// Create a hierarchy state for `tui-tree-widget` using stable numeric IDs.
pub fn tree_state() -> tui_tree_widget::TreeState<usize> {
    tui_tree_widget::TreeState::default()
}

#[cfg(feature = "advanced")]
/// Create selection/scroll state for `tui-widget-list`.
pub fn widget_list_state(selected: Option<usize>) -> tui_widget_list::ListState {
    tui_widget_list::ListState::new_with_index(selected)
}

#[cfg(feature = "advanced")]
/// Create a vt100 parser suitable for feeding PTY output into `tui-term`.
pub fn terminal_parser(rows: u16, cols: u16, scrollback: usize) -> tui_term::vt100::Parser {
    tui_term::vt100::Parser::new(rows.max(1), cols.max(1), scrollback)
}

#[cfg(feature = "advanced")]
/// Detect the current terminal's color capability without issuing interactive
/// terminal queries. Generated applications may opt into query-based detection.
pub fn terminal_color_profile() -> termprofile::TermProfile {
    use std::io::stdout;
    use termprofile::{DetectorSettings, TermProfile};

    TermProfile::detect(&stdout(), DetectorSettings::default())
}

#[cfg(feature = "advanced")]
/// Highlight source text using `tui-syntax-highlight` and syntect defaults.
///
/// This is intentionally a pure conversion helper so callers can cache the
/// returned `Text` by source/language/theme rather than highlighting per frame.
pub fn syntax_highlight(
    source: &str,
    language: &str,
    theme_name: &str,
) -> Result<Text<'static>, String> {
    use tui_syntax_highlight::{Highlighter, syntect};
    use syntect::{highlighting::ThemeSet, parsing::SyntaxSet, util::LinesWithEndings};

    let syntax_set = SyntaxSet::load_defaults_newlines();
    let theme_set = ThemeSet::load_defaults();
    let syntax = syntax_set
        .find_syntax_by_name(language)
        .or_else(|| syntax_set.find_syntax_by_extension(language))
        .ok_or_else(|| format!("unknown syntax: {language}"))?;
    let theme = theme_set
        .themes
        .get(theme_name)
        .or_else(|| theme_set.themes.get("base16-ocean.dark"))
        .cloned()
        .ok_or_else(|| "no syntect theme available".to_string())?;
    let highlighter = Highlighter::new(theme);
    highlighter
        .highlight_lines(LinesWithEndings::from(source), syntax, &syntax_set)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn textarea_preserves_lines() {
        let textarea = textarea_from_text("alpha\nbeta");
        assert_eq!(textarea.lines(), ["alpha", "beta"]);
    }

    #[test]
    fn ansi_parser_preserves_text_and_style() {
        let text = ansi_text("\u{1b}[32mready\u{1b}[0m").unwrap();
        assert_eq!(text.lines.len(), 1);
        assert_eq!(text.lines[0].spans[0].content, "ready");
    }

    #[test]
    fn halfblock_picker_is_constructible_headlessly() {
        let picker = halfblock_image_picker();
        assert!(picker.font_size().width > 0);
        assert!(picker.font_size().height > 0);
    }

    #[test]
    fn scrollview_state_is_constructible() {
        let _state = scrollview_state();
    }

    #[cfg(feature = "advanced")]
    #[test]
    fn advanced_state_factories_are_constructible() {
        let _tree = tree_state();
        let list = widget_list_state(Some(2));
        assert_eq!(list.selected, Some(2));
        let _parser = terminal_parser(24, 80, 1000);
    }

    #[cfg(feature = "advanced")]
    #[test]
    fn syntax_highlight_returns_ratatui_text() {
        let text = syntax_highlight("fn main() {}\n", "Rust", "base16-ocean.dark").unwrap();
        assert!(!text.lines.is_empty());
    }
}
