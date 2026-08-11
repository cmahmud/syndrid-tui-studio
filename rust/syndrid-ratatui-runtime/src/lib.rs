//! Syndrid's version-coherent Ratatui ecosystem integration layer.
//!
//! Studio owns the portable `.tui` model. This crate pins and re-exports a
//! coherent set of production Ratatui libraries so CI catches ecosystem drift
//! before Syndrid emits code that cannot build.

use serde::{Deserialize, Serialize};

pub mod adapters;
#[cfg(feature = "desktop")]
pub mod preview;

pub use ansi_to_tui;
pub use ratatui;
pub use ratatui_image;
pub use ratatui_textarea;
pub use tachyonfx;
pub use tui_widgets;

#[cfg(feature = "advanced")]
pub use ratatui_interact;
#[cfg(feature = "advanced")]
pub use termprofile;
#[cfg(feature = "advanced")]
pub use tui_nodes;
#[cfg(feature = "advanced")]
pub use tui_syntax_highlight;
#[cfg(feature = "advanced")]
pub use tui_term;
#[cfg(feature = "advanced")]
pub use tui_tree_widget;
#[cfg(feature = "advanced")]
pub use tui_widget_list;

#[cfg(feature = "embedded")]
pub use mousefood;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeLibrary {
    pub id: &'static str,
    pub crate_name: &'static str,
    pub version: &'static str,
    pub purpose: &'static str,
    pub optional: bool,
}

pub const RUNTIME_LIBRARIES: &[RuntimeLibrary] = &[
    RuntimeLibrary {
        id: "ratatui",
        crate_name: "ratatui",
        version: "0.30.2",
        purpose: "Core rendering, layout, style and terminal backend",
        optional: false,
    },
    RuntimeLibrary {
        id: "tachyonfx",
        crate_name: "tachyonfx",
        version: "0.25.1",
        purpose: "Effects, composition, interpolation and spatial patterns",
        optional: false,
    },
    RuntimeLibrary {
        id: "textarea",
        crate_name: "ratatui-textarea",
        version: "0.9.2",
        purpose: "Stateful multiline text/code editing",
        optional: false,
    },
    RuntimeLibrary {
        id: "widgets",
        crate_name: "tui-widgets",
        version: "0.7.10",
        purpose: "Big text, cards, popup, prompts, scrollbar and scrollview widgets",
        optional: false,
    },
    RuntimeLibrary {
        id: "image",
        crate_name: "ratatui-image",
        version: "11.0.6",
        purpose: "Kitty/Sixel/iTerm2/half-block image rendering",
        optional: false,
    },
    RuntimeLibrary {
        id: "ansi-import",
        crate_name: "ansi-to-tui",
        version: "8.0.1",
        purpose: "ANSI terminal output conversion into Ratatui text",
        optional: false,
    },
    RuntimeLibrary {
        id: "tree",
        crate_name: "tui-tree-widget",
        version: "0.24.1",
        purpose: "Stateful hierarchy rendering",
        optional: true,
    },
    RuntimeLibrary {
        id: "widget-list",
        crate_name: "tui-widget-list",
        version: "0.15.3",
        purpose: "Arbitrary-widget lists with scrolling and hit testing",
        optional: true,
    },
    RuntimeLibrary {
        id: "terminal",
        crate_name: "tui-term",
        version: "0.3.4",
        purpose: "VT/PTY terminal rendering",
        optional: true,
    },
    RuntimeLibrary {
        id: "interact",
        crate_name: "ratatui-interact",
        version: "0.5.3",
        purpose: "Focus management, mouse support and interactive widgets",
        optional: true,
    },
    RuntimeLibrary {
        id: "syntax",
        crate_name: "tui-syntax-highlight",
        version: "0.2.0",
        purpose: "Syntax-highlighted Ratatui text",
        optional: true,
    },
    RuntimeLibrary {
        id: "termprofile",
        crate_name: "termprofile",
        version: "0.2.4",
        purpose: "Terminal color/styling capability detection",
        optional: true,
    },
    RuntimeLibrary {
        id: "nodes",
        crate_name: "tui-nodes",
        version: "0.10.0",
        purpose: "Node graph visualization",
        optional: true,
    },
    RuntimeLibrary {
        id: "embedded",
        crate_name: "mousefood",
        version: "0.5.2",
        purpose: "Embedded-graphics backend for physical displays",
        optional: true,
    },
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImageProtocolPolicy {
    Auto,
    Kitty,
    Sixel,
    Iterm2,
    Halfblocks,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImageFitPolicy {
    Contain,
    Cover,
    Stretch,
    Original,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImagePolicy {
    pub protocol: ImageProtocolPolicy,
    pub fit: ImageFitPolicy,
    pub preserve_aspect_ratio: bool,
    pub fallback_alt_text: bool,
}
impl Default for ImagePolicy {
    fn default() -> Self {
        Self {
            protocol: ImageProtocolPolicy::Auto,
            fit: ImageFitPolicy::Contain,
            preserve_aspect_ratio: true,
            fallback_alt_text: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextareaPolicy {
    pub search: bool,
    pub line_numbers: bool,
    pub soft_wrap: bool,
    pub tab_width: u8,
}
impl Default for TextareaPolicy {
    fn default() -> Self {
        Self {
            search: true,
            line_numbers: false,
            soft_wrap: true,
            tab_width: 4,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WidgetPackPolicy {
    pub big_text: bool,
    pub cards: bool,
    pub popup: bool,
    pub prompts: bool,
    pub scrollbar: bool,
    pub scrollview: bool,
}
impl Default for WidgetPackPolicy {
    fn default() -> Self {
        Self {
            big_text: true,
            cards: true,
            popup: true,
            prompts: true,
            scrollbar: true,
            scrollview: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdvancedPolicy {
    pub tree_widget: bool,
    pub widget_list: bool,
    pub terminal: bool,
    pub interaction: bool,
    pub syntax_highlight: bool,
    pub terminal_profile: bool,
    pub node_graph: bool,
}
impl Default for AdvancedPolicy {
    fn default() -> Self {
        Self {
            tree_widget: true,
            widget_list: true,
            terminal: true,
            interaction: true,
            syntax_highlight: true,
            terminal_profile: true,
            node_graph: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmbeddedPolicy {
    pub enabled: bool,
    pub framebuffer: bool,
    pub unicode_fonts: bool,
}
impl Default for EmbeddedPolicy {
    fn default() -> Self {
        Self {
            enabled: false,
            framebuffer: true,
            unicode_fonts: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct EcosystemProfile {
    pub image: ImagePolicy,
    pub textarea: TextareaPolicy,
    pub widgets: WidgetPackPolicy,
    pub advanced: AdvancedPolicy,
    pub embedded: EmbeddedPolicy,
}

pub fn runtime_manifest_json() -> String {
    serde_json::to_string_pretty(RUNTIME_LIBRARIES).expect("runtime metadata is serializable")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_manifest_has_unique_ids() {
        let mut ids = std::collections::BTreeSet::new();
        for library in RUNTIME_LIBRARIES {
            assert!(
                ids.insert(library.id),
                "duplicate runtime id: {}",
                library.id
            );
        }
    }

    #[test]
    fn default_profile_round_trips() {
        let profile = EcosystemProfile::default();
        let json = serde_json::to_string(&profile).unwrap();
        let restored: EcosystemProfile = serde_json::from_str(&json).unwrap();
        assert_eq!(profile, restored);
    }

    #[test]
    fn primary_upstream_crates_are_linked() {
        assert!(std::any::type_name::<ratatui::layout::Rect>().contains("Rect"));
        assert!(std::any::type_name::<ratatui_textarea::TextArea<'static>>().contains("TextArea"));
        assert!(std::any::type_name::<tachyonfx::EffectTimer>().contains("EffectTimer"));
    }

    #[cfg(feature = "advanced")]
    #[test]
    fn advanced_crates_are_linked() {
        let names = [
            std::any::type_name::<tui_tree_widget::TreeState<usize>>(),
            std::any::type_name::<tui_widget_list::ListState>(),
            std::any::type_name::<tui_term::widget::Cursor>(),
        ];
        assert!(names.iter().all(|name| !name.is_empty()));
    }
}
