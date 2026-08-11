//! Syndrid's version-coherent Ratatui ecosystem integration layer.
//!
//! This crate is intentionally small: Studio owns the portable `.tui` model,
//! while generated/runtime Rust can depend on one coherent set of upstream
//! crates. Keeping these re-exports together lets CI catch incompatible
//! Ratatui ecosystem upgrades before Studio emits code that cannot build.

use serde::{Deserialize, Serialize};

pub use ansi_to_tui;
pub use ratatui;
pub use ratatui_image;
pub use ratatui_textarea;
pub use tachyonfx;
pub use tui_widgets;

#[cfg(feature = "embedded")]
pub use mousefood;

/// Dependency metadata surfaced to Studio/MCP and embedded in exported specs.
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
            assert!(ids.insert(library.id), "duplicate runtime id: {}", library.id);
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
    fn upstream_crates_are_linked() {
        // Taking type names forces the public re-exports through type checking
        // without constructing terminal/image backends in a headless CI job.
        assert!(std::any::type_name::<ratatui::layout::Rect>().contains("Rect"));
        assert!(std::any::type_name::<ratatui_textarea::TextArea<'static>>().contains("TextArea"));
        assert!(std::any::type_name::<tachyonfx::EffectTimer>().contains("EffectTimer"));
    }
}
