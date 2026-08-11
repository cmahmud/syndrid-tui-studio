//! Native terminal test runtime used by Syndrid TUI Studio.
//!
//! The browser resolves responsive/state/mock-data intent into a portable test
//! spec with integer terminal-cell rectangles. This module renders that spec
//! through real Ratatui widgets, compiles authored TachyonFX DSL at runtime,
//! and runs inside an actual PTY/ConPTY launched by the Tauri desktop app.

use std::{fs, io, path::Path, time::{Duration as StdDuration, Instant}};

use ansi_to_tui::IntoText as _;
use ratatui::{
    crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers},
    layout::{Alignment, Constraint, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Text},
    widgets::{Block, Borders, Gauge, List, ListItem, Paragraph, Row, Table, Tabs, Wrap},
    Frame,
};
use serde::Deserialize;
use serde_json::{Map, Value};
use tachyonfx::{dsl::EffectDsl, Effect, EffectManager, Shader};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRect {
    pub x: u16,
    pub y: u16,
    pub width: u16,
    pub height: u16,
}

impl PreviewRect {
    fn rect(&self, bounds: Rect) -> Rect {
        let x = self.x.min(bounds.width);
        let y = self.y.min(bounds.height);
        let width = self.width.min(bounds.width.saturating_sub(x));
        let height = self.height.min(bounds.height.saturating_sub(y));
        Rect::new(bounds.x.saturating_add(x), bounds.y.saturating_add(y), width, height)
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewViewport {
    pub id: String,
    pub label: String,
    pub width: u16,
    pub height: u16,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSettings {
    #[serde(default = "one_f64")]
    pub speed: f64,
    #[serde(default)]
    pub reduced_motion: bool,
    #[serde(default)]
    pub r#loop: bool,
    #[serde(default = "true_bool")]
    pub fake_data: bool,
    #[serde(default = "true_bool")]
    pub interactive: bool,
    #[serde(default = "true_bool")]
    pub show_debug_overlay: bool,
    #[serde(default)]
    pub start_at_ms: u64,
}

fn one_f64() -> f64 { 1.0 }
fn true_bool() -> bool { true }

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub at_ms: u64,
    pub component_id: Option<String>,
    pub property: Option<String>,
    pub value: Option<Value>,
    pub state: Option<String>,
    pub event: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewScenario {
    pub id: String,
    pub name: String,
    pub preset: String,
    #[serde(default = "default_seed")]
    pub seed: i64,
    #[serde(default = "default_duration")]
    pub duration_ms: u64,
    #[serde(default)]
    pub variables: Map<String, Value>,
    #[serde(default)]
    pub timeline: Vec<TimelineEvent>,
}

fn default_seed() -> i64 { 42 }
fn default_duration() -> u64 { 4_000 }

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewKeyBinding {
    pub key: String,
    pub action: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewNode {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub rect: PreviewRect,
    #[serde(default)]
    pub props: Map<String, Value>,
    #[serde(default)]
    pub style: Map<String, Value>,
    #[serde(default)]
    pub events: Map<String, Value>,
    #[serde(default)]
    pub focusable: bool,
    #[serde(default)]
    pub focus_order: i64,
    #[serde(default)]
    pub key_bindings: Vec<PreviewKeyBinding>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewMotion {
    pub component_id: String,
    pub component_name: String,
    pub effect_id: String,
    pub effect_name: String,
    pub trigger: Value,
    pub target: Value,
    pub area: PreviewRect,
    pub dsl: String,
    pub reduced_motion_dsl: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalTestSpec {
    pub schema: String,
    pub generated_at: String,
    pub viewport: PreviewViewport,
    pub state_name: String,
    pub scenario: PreviewScenario,
    pub settings: PreviewSettings,
    #[serde(default)]
    pub nodes: Vec<PreviewNode>,
    #[serde(default)]
    pub motion: Vec<PreviewMotion>,
    #[serde(default)]
    pub warnings: Vec<Value>,
    #[serde(default)]
    pub fallback_text: String,
}

#[derive(Debug)]
struct RuntimeState {
    spec: TerminalTestSpec,
    nodes: Vec<PreviewNode>,
    focusable: Vec<usize>,
    focus_position: usize,
    elapsed_ms: u64,
    paused: bool,
    speed: f64,
    should_quit: bool,
    last_event: String,
    effects: EffectManager<String>,
    effect_errors: Vec<String>,
    last_instant: Instant,
}

impl RuntimeState {
    fn new(spec: TerminalTestSpec) -> Self {
        let mut state = Self {
            speed: spec.settings.speed.clamp(0.1, 4.0),
            elapsed_ms: spec.settings.start_at_ms,
            nodes: spec.nodes.clone(),
            focusable: Vec::new(),
            focus_position: 0,
            paused: false,
            should_quit: false,
            last_event: "startup".into(),
            effects: EffectManager::default(),
            effect_errors: Vec::new(),
            last_instant: Instant::now(),
            spec,
        };
        state.focusable = state.nodes.iter().enumerate()
            .filter(|(_, node)| node.focusable)
            .map(|(index, _)| index)
            .collect();
        state.focusable.sort_by_key(|index| state.nodes[*index].focus_order);
        state.install_mount_effects();
        state.apply_timeline();
        state
    }

    fn focused_node_index(&self) -> Option<usize> {
        self.focusable.get(self.focus_position).copied()
    }

    fn focused_id(&self) -> Option<&str> {
        self.focused_node_index().map(|index| self.nodes[index].id.as_str())
    }

    fn install_mount_effects(&mut self) {
        self.effects = EffectManager::default();
        self.effect_errors.clear();
        for motion in &self.spec.motion {
            let trigger_kind = motion.trigger.get("kind").and_then(Value::as_str).unwrap_or("mount");
            if trigger_kind != "mount" && trigger_kind != "show" { continue; }
            match compile_motion(motion, self.spec.settings.reduced_motion) {
                Ok(effect) => self.effects.add_unique_effect(motion.effect_id.clone(), effect),
                Err(error) => self.effect_errors.push(format!("{}: {error}", motion.effect_name)),
            }
        }
    }

    fn trigger_effects(&mut self, trigger: &str, component_id: Option<&str>, key: Option<&str>) {
        for motion in &self.spec.motion {
            let kind = motion.trigger.get("kind").and_then(Value::as_str).unwrap_or("");
            if kind != trigger { continue; }
            if let Some(component_id) = component_id {
                if motion.component_id != component_id { continue; }
            }
            if trigger == "key" {
                let authored = motion.trigger.get("key").and_then(Value::as_str).unwrap_or("");
                if key != Some(authored) { continue; }
            }
            if let Ok(effect) = compile_motion(motion, self.spec.settings.reduced_motion) {
                self.effects.add_unique_effect(motion.effect_id.clone(), effect);
            }
        }
    }

    fn replay(&mut self) {
        self.elapsed_ms = self.spec.settings.start_at_ms;
        self.paused = false;
        self.nodes = self.spec.nodes.clone();
        self.last_event = "replay".into();
        self.install_mount_effects();
        self.apply_timeline();
        self.last_instant = Instant::now();
    }

    fn tick(&mut self) -> StdDuration {
        let now = Instant::now();
        let real = now.saturating_duration_since(self.last_instant);
        self.last_instant = now;
        if self.paused { return StdDuration::ZERO; }
        let scaled = real.mul_f64(self.speed);
        self.elapsed_ms = self.elapsed_ms.saturating_add(scaled.as_millis() as u64);
        let duration = self.spec.scenario.duration_ms.max(1);
        if self.elapsed_ms >= duration && self.spec.settings.r#loop {
            self.replay();
            return StdDuration::ZERO;
        }
        self.apply_timeline();
        scaled
    }

    fn apply_timeline(&mut self) {
        for event in &self.spec.scenario.timeline {
            if event.at_ms > self.elapsed_ms { continue; }
            let Some(component_id) = event.component_id.as_deref() else { continue; };
            let Some(node) = self.nodes.iter_mut().find(|node| node.id == component_id) else { continue; };
            if let (Some(property), Some(value)) = (&event.property, &event.value) {
                node.props.insert(property.clone(), value.clone());
            }
        }
    }

    fn handle_key(&mut self, key: KeyEvent) {
        if key.kind == KeyEventKind::Release { return; }
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        if ctrl {
            match key.code {
                KeyCode::Char('q') => { self.should_quit = true; self.last_event = "Ctrl+Q quit".into(); return; }
                KeyCode::Char('r') => { self.replay(); return; }
                KeyCode::Char('p') => { self.paused = !self.paused; self.last_event = if self.paused { "paused" } else { "playing" }.into(); return; }
                KeyCode::Char('+') | KeyCode::Char('=') => { self.speed = (self.speed * 2.0).min(4.0); self.last_event = format!("speed {}x", self.speed); return; }
                KeyCode::Char('-') => { self.speed = (self.speed / 2.0).max(0.1); self.last_event = format!("speed {}x", self.speed); return; }
                _ => {}
            }
        }
        if !self.spec.settings.interactive { return; }
        let before = self.focused_id().map(str::to_owned);
        match key.code {
            KeyCode::Tab => self.focus_next(false),
            KeyCode::BackTab => self.focus_next(true),
            KeyCode::Up => self.adjust_selection(-1),
            KeyCode::Down => self.adjust_selection(1),
            KeyCode::Left => self.adjust_horizontal(-1),
            KeyCode::Right => self.adjust_horizontal(1),
            KeyCode::Enter => self.activate_focused(),
            KeyCode::Backspace => self.edit_focused(None, true),
            KeyCode::Char(ch) if !ctrl => self.edit_focused(Some(ch), false),
            _ => {}
        }
        let after = self.focused_id().map(str::to_owned);
        if before != after {
            if let Some(id) = before.as_deref() { self.trigger_effects("blur", Some(id), None); }
            if let Some(id) = after.as_deref() { self.trigger_effects("focus", Some(id), None); }
        }
        let key_name = key_to_string(key);
        self.trigger_effects("key", after.as_deref(), Some(&key_name));
        self.last_event = key_name;
    }

    fn focus_next(&mut self, reverse: bool) {
        if self.focusable.is_empty() { return; }
        if reverse {
            self.focus_position = if self.focus_position == 0 { self.focusable.len() - 1 } else { self.focus_position - 1 };
        } else {
            self.focus_position = (self.focus_position + 1) % self.focusable.len();
        }
    }

    fn adjust_selection(&mut self, delta: isize) {
        let Some(index) = self.focused_node_index() else { return; };
        let node = &mut self.nodes[index];
        if !matches!(node.r#type.as_str(), "List" | "Menu" | "Select" | "Table" | "Tree") { return; }
        let count = item_count(node).max(1);
        let current = node.props.get("selectedIndex").and_then(Value::as_i64).unwrap_or(0);
        let next = (current + delta as i64).clamp(0, count.saturating_sub(1) as i64);
        node.props.insert("selectedIndex".into(), Value::from(next));
        let id = node.id.clone();
        self.trigger_effects("select", Some(&id), None);
    }

    fn adjust_horizontal(&mut self, delta: isize) {
        let Some(index) = self.focused_node_index() else { return; };
        let node = &mut self.nodes[index];
        if node.r#type == "Tabs" {
            let count = node.props.get("tabs").and_then(Value::as_array).map(Vec::len).unwrap_or(1).max(1);
            let current = node.props.get("activeTab").and_then(Value::as_i64).unwrap_or(0);
            let next = (current + delta as i64).rem_euclid(count as i64);
            node.props.insert("activeTab".into(), Value::from(next));
        } else if node.r#type == "Select" {
            self.adjust_selection(delta);
        }
    }

    fn activate_focused(&mut self) {
        let Some(index) = self.focused_node_index() else { return; };
        let node = &mut self.nodes[index];
        if matches!(node.r#type.as_str(), "Checkbox" | "Toggle" | "Radio") {
            let checked = node.props.get("checked").and_then(Value::as_bool).unwrap_or(false);
            node.props.insert("checked".into(), Value::Bool(!checked));
        }
        let id = node.id.clone();
        self.trigger_effects("select", Some(&id), None);
    }

    fn edit_focused(&mut self, ch: Option<char>, backspace: bool) {
        let Some(index) = self.focused_node_index() else { return; };
        let node = &mut self.nodes[index];
        if !matches!(node.r#type.as_str(), "TextInput" | "TextArea") { return; }
        let mut value = node.props.get("value").and_then(Value::as_str).unwrap_or_default().to_string();
        if backspace { value.pop(); } else if let Some(ch) = ch { value.push(ch); }
        node.props.insert("value".into(), Value::String(value));
    }
}

fn compile_motion(motion: &PreviewMotion, reduced: bool) -> Result<Effect, String> {
    let source = if reduced { &motion.reduced_motion_dsl } else { &motion.dsl };
    let mut effect = EffectDsl::new().compiler().compile(source).map_err(|error| error.to_string())?;
    effect.set_area(motion.area.rect(Rect::new(0, 0, u16::MAX, u16::MAX)));
    Ok(effect)
}

fn key_to_string(key: KeyEvent) -> String {
    match key.code {
        KeyCode::Char(ch) => if key.modifiers.contains(KeyModifiers::CONTROL) { format!("Ctrl+{ch}") } else { ch.to_string() },
        KeyCode::Enter => "Enter".into(),
        KeyCode::Esc => "Esc".into(),
        KeyCode::Tab => "Tab".into(),
        KeyCode::BackTab => "Shift+Tab".into(),
        KeyCode::Up => "Up".into(),
        KeyCode::Down => "Down".into(),
        KeyCode::Left => "Left".into(),
        KeyCode::Right => "Right".into(),
        KeyCode::Backspace => "Backspace".into(),
        _ => format!("{:?}", key.code),
    }
}

fn item_count(node: &PreviewNode) -> usize {
    match node.r#type.as_str() {
        "Table" => node.props.get("rows").and_then(Value::as_array).map(Vec::len).unwrap_or(0),
        "Tabs" => node.props.get("tabs").and_then(Value::as_array).map(Vec::len).unwrap_or(0),
        _ => node.props.get("items").and_then(Value::as_array)
            .or_else(|| node.props.get("options").and_then(Value::as_array))
            .map(Vec::len).unwrap_or(0),
    }
}

fn value_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Number(value)) => value.to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

fn object_label(value: &Value) -> String {
    if let Some(value) = value.as_str() { return value.to_owned(); }
    value.get("label").and_then(Value::as_str)
        .or_else(|| value.get("name").and_then(Value::as_str))
        .or_else(|| value.get("id").and_then(Value::as_str))
        .unwrap_or("")
        .to_owned()
}

fn parse_color(value: Option<&Value>) -> Option<Color> {
    let raw = value?.as_str()?;
    Some(match raw {
        "black" => Color::Black,
        "red" => Color::Red,
        "green" => Color::Green,
        "yellow" => Color::Yellow,
        "blue" => Color::Blue,
        "magenta" => Color::Magenta,
        "cyan" => Color::Cyan,
        "white" => Color::White,
        "brightBlack" => Color::DarkGray,
        "brightRed" => Color::LightRed,
        "brightGreen" => Color::LightGreen,
        "brightYellow" => Color::LightYellow,
        "brightBlue" => Color::LightBlue,
        "brightMagenta" => Color::LightMagenta,
        "brightCyan" => Color::LightCyan,
        "brightWhite" => Color::White,
        _ if raw.starts_with('#') && raw.len() == 7 => {
            let parsed = u32::from_str_radix(&raw[1..], 16).ok()?;
            Color::Rgb(((parsed >> 16) & 0xff) as u8, ((parsed >> 8) & 0xff) as u8, (parsed & 0xff) as u8)
        }
        _ => return None,
    })
}

fn node_style(node: &PreviewNode, focused: bool) -> Style {
    let mut style = Style::default();
    if let Some(color) = parse_color(node.style.get("color")) { style = style.fg(color); }
    if let Some(color) = parse_color(node.style.get("backgroundColor")) { style = style.bg(color); }
    if node.style.get("bold").and_then(Value::as_bool).unwrap_or(false) { style = style.add_modifier(Modifier::BOLD); }
    if node.style.get("italic").and_then(Value::as_bool).unwrap_or(false) { style = style.add_modifier(Modifier::ITALIC); }
    if node.style.get("underline").and_then(Value::as_bool).unwrap_or(false) { style = style.add_modifier(Modifier::UNDERLINED); }
    if focused { style = style.add_modifier(Modifier::REVERSED | Modifier::BOLD); }
    style
}

fn block_for(node: &PreviewNode, focused: bool, title: Option<String>) -> Block<'static> {
    let mut block = Block::default().style(node_style(node, focused));
    if node.style.get("border").and_then(Value::as_bool).unwrap_or(false) || focused {
        block = block.borders(Borders::ALL);
        if let Some(color) = parse_color(node.style.get("borderColor")) { block = block.border_style(Style::default().fg(color)); }
    }
    if let Some(title) = title.filter(|title| !title.is_empty()) { block = block.title(title); }
    block
}

fn scenario_progress(state: &RuntimeState, node: &PreviewNode) -> Option<(f64, String)> {
    if !matches!(node.r#type.as_str(), "ProgressBar" | "Gauge") { return None; }
    let max = node.props.get("max").and_then(Value::as_f64).unwrap_or(100.0).max(1.0);
    let authored = node.props.get("value").and_then(Value::as_f64).unwrap_or(0.0);
    let value = match state.spec.scenario.preset.as_str() {
        "loading" | "slow-network" => {
            let duration = state.spec.scenario.duration_ms.max(1) as f64;
            (state.elapsed_ms as f64 / duration).clamp(0.0, 1.0) * max
        }
        _ => authored,
    };
    let ratio = (value / max).clamp(0.0, 1.0);
    let label = if node.r#type == "Gauge" {
        format!("{} {:>3}%", value_string(node.props.get("label")), (ratio * 100.0).round() as u16)
    } else {
        format!("{:>3}%", (ratio * 100.0).round() as u16)
    };
    Some((ratio, label))
}

fn render_node(frame: &mut Frame, bounds: Rect, state: &RuntimeState, index: usize) {
    let node = &state.nodes[index];
    let area = node.rect.rect(bounds);
    if area.width == 0 || area.height == 0 { return; }
    let focused = state.focused_node_index() == Some(index);
    let style = node_style(node, focused);
    match node.r#type.as_str() {
        "Screen" | "Box" | "Grid" | "Modal" => {
            let title = if node.r#type == "Modal" { Some(value_string(node.props.get("title"))) } else { None };
            frame.render_widget(block_for(node, focused, title), area);
        }
        "Text" => {
            let alignment = match node.props.get("align").and_then(Value::as_str) {
                Some("center") => Alignment::Center,
                Some("right") => Alignment::Right,
                _ => Alignment::Left,
            };
            let paragraph = Paragraph::new(value_string(node.props.get("content"))).style(style).alignment(alignment)
                .wrap(Wrap { trim: false });
            frame.render_widget(paragraph, area);
        }
        "AnsiText" => {
            let source = value_string(node.props.get("content"));
            let text = source.as_bytes().into_text().unwrap_or_else(|_| Text::raw(source));
            frame.render_widget(Paragraph::new(text).block(block_for(node, focused, None)).wrap(Wrap { trim: false }), area);
        }
        "Code" | "Log" | "Terminal" | "NodeGraph" | "Image" => {
            let content = if node.r#type == "Log" {
                node.props.get("lines").and_then(Value::as_array)
                    .map(|lines| lines.iter().map(|value| value_string(Some(value))).collect::<Vec<_>>().join("\n"))
                    .unwrap_or_default()
            } else if node.r#type == "Image" {
                let alt = value_string(node.props.get("alt"));
                format!("[image] {alt}")
            } else if node.r#type == "NodeGraph" {
                node.props.get("nodes").and_then(Value::as_array)
                    .map(|nodes| nodes.iter().map(object_label).collect::<Vec<_>>().join(" → "))
                    .unwrap_or_else(|| node.name.clone())
            } else {
                value_string(node.props.get("content").or_else(|| node.props.get("placeholder")))
            };
            frame.render_widget(Paragraph::new(content).style(style).block(block_for(node, focused, None)).wrap(Wrap { trim: false }), area);
        }
        "ProgressBar" | "Gauge" => {
            let (ratio, label) = scenario_progress(state, node).unwrap_or((0.0, "0%".into()));
            let gauge = Gauge::default().block(block_for(node, focused, None)).gauge_style(style).ratio(ratio).label(label);
            frame.render_widget(gauge, area);
        }
        "Spinner" => {
            let frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            let frame_index = ((state.elapsed_ms / 80) as usize) % frames.len();
            let label = value_string(node.props.get("label"));
            frame.render_widget(Paragraph::new(format!("{} {}", frames[frame_index], label)).style(style), area);
        }
        "Button" => {
            let label = value_string(node.props.get("label"));
            frame.render_widget(Paragraph::new(label).style(style).alignment(Alignment::Center).block(block_for(node, focused, None)), area);
        }
        "TextInput" | "TextArea" => {
            let value = value_string(node.props.get("value"));
            let placeholder = value_string(node.props.get("placeholder"));
            let content = if value.is_empty() { placeholder } else { value };
            frame.render_widget(Paragraph::new(content).style(style).block(block_for(node, focused, None)).wrap(Wrap { trim: false }), area);
        }
        "Checkbox" | "Radio" | "Toggle" => {
            let checked = node.props.get("checked").and_then(Value::as_bool).unwrap_or(false);
            let mark = match node.r#type.as_str() {
                "Radio" => if checked { "●" } else { "○" },
                "Toggle" => if checked { "ON" } else { "OFF" },
                _ => if checked { "✓" } else { " " },
            };
            frame.render_widget(Paragraph::new(format!("[{mark}] {}", value_string(node.props.get("label")))).style(style), area);
        }
        "List" | "Menu" | "Select" | "Tree" => {
            let values = node.props.get("items").and_then(Value::as_array)
                .or_else(|| node.props.get("options").and_then(Value::as_array));
            let selected = node.props.get("selectedIndex").and_then(Value::as_u64).unwrap_or(0) as usize;
            let items = values.unwrap_or(&Vec::new()).iter().enumerate().map(|(item_index, value)| {
                let prefix = if item_index == selected { "› " } else { "  " };
                ListItem::new(format!("{prefix}{}", object_label(value)))
            }).collect::<Vec<_>>();
            frame.render_widget(List::new(items).style(style).block(block_for(node, focused, None)), area);
        }
        "Table" => {
            let columns = node.props.get("columns").and_then(Value::as_array).cloned().unwrap_or_default();
            let rows = node.props.get("rows").and_then(Value::as_array).cloned().unwrap_or_default();
            let header = Row::new(columns.iter().map(|value| value_string(Some(value))).collect::<Vec<_>>()).style(Style::default().add_modifier(Modifier::BOLD));
            let table_rows = rows.iter().map(|row| Row::new(row.as_array().map(|values| values.iter().map(|value| value_string(Some(value))).collect::<Vec<_>>()).unwrap_or_default())).collect::<Vec<_>>();
            let count = columns.len().max(1);
            let widths = vec![Constraint::Ratio(1, count as u32); count];
            frame.render_widget(Table::new(table_rows, widths).header(header).style(style).block(block_for(node, focused, None)), area);
        }
        "Tabs" => {
            let tabs = node.props.get("tabs").and_then(Value::as_array).cloned().unwrap_or_default();
            let active = node.props.get("activeTab").and_then(Value::as_u64).unwrap_or(0) as usize;
            let titles = tabs.iter().map(|value| Line::from(object_label(value))).collect::<Vec<_>>();
            frame.render_widget(Tabs::new(titles).select(active.min(tabs.len().saturating_sub(1))).style(style).highlight_style(style.add_modifier(Modifier::REVERSED)), area);
        }
        "StatusBar" | "Breadcrumb" => {
            let key = if node.r#type == "StatusBar" { "items" } else { "items" };
            let values = node.props.get(key).and_then(Value::as_array).cloned().unwrap_or_default();
            let separator = if node.r#type == "Breadcrumb" { value_string(node.props.get("separator")) } else { "  ".into() };
            let content = values.iter().map(|value| {
                if node.r#type == "StatusBar" {
                    let key = value.get("key").and_then(Value::as_str).unwrap_or("");
                    let label = value.get("label").and_then(Value::as_str).unwrap_or("");
                    format!("{key} {label}")
                } else { object_label(value) }
            }).collect::<Vec<_>>().join(&separator);
            frame.render_widget(Paragraph::new(content).style(style), area);
        }
        "Sparkline" => {
            let data = node.props.get("data").and_then(Value::as_array).cloned().unwrap_or_default();
            let blocks = ['▁','▂','▃','▄','▅','▆','▇','█'];
            let max = data.iter().filter_map(Value::as_f64).fold(1.0_f64, f64::max);
            let content = data.iter().filter_map(Value::as_f64).map(|value| {
                let index = ((value / max).clamp(0.0, 1.0) * 7.0).round() as usize;
                blocks[index]
            }).collect::<String>();
            frame.render_widget(Paragraph::new(content).style(style), area);
        }
        "Toast" => frame.render_widget(Paragraph::new(value_string(node.props.get("message"))).style(style).block(block_for(node, focused, None)), area),
        "Separator" => {
            let vertical = node.props.get("orientation").and_then(Value::as_str) == Some("vertical");
            let content = if vertical { "│\n".repeat(area.height as usize) } else { "─".repeat(area.width as usize) };
            frame.render_widget(Paragraph::new(content).style(style), area);
        }
        _ => frame.render_widget(Paragraph::new(node.name.clone()).style(style), area),
    }
}

fn render_frame(frame: &mut Frame, state: &mut RuntimeState, delta: StdDuration) {
    let bounds = frame.area();
    for index in 0..state.nodes.len() { render_node(frame, bounds, state, index); }
    state.effects.process_effects(delta.into(), frame.buffer_mut(), bounds);
    if state.spec.settings.show_debug_overlay && bounds.height > 0 {
        let focused = state.focused_id().unwrap_or("none");
        let overlay = format!(
            " TEST {} | {}x | t={}ms | focus={} | {} | Ctrl+P pause · Ctrl+R replay · Ctrl+Q quit ",
            state.spec.scenario.name,
            state.speed,
            state.elapsed_ms,
            focused,
            state.last_event
        );
        let area = Rect::new(bounds.x, bounds.y + bounds.height.saturating_sub(1), bounds.width, 1);
        frame.render_widget(Paragraph::new(overlay).style(Style::default().fg(Color::Black).bg(Color::Cyan)), area);
    }
    if !state.effect_errors.is_empty() && bounds.height > 1 {
        let area = Rect::new(bounds.x, bounds.y, bounds.width, 1);
        frame.render_widget(Paragraph::new(format!("TachyonFX: {}", state.effect_errors.join(" | "))).style(Style::default().fg(Color::LightRed)), area);
    }
}

pub fn parse_spec(json: &str) -> Result<TerminalTestSpec, String> {
    let spec: TerminalTestSpec = serde_json::from_str(json).map_err(|error| format!("parse terminal test spec: {error}"))?;
    if spec.schema != "syndrid-terminal-test/v1" { return Err(format!("unsupported terminal test schema: {}", spec.schema)); }
    if spec.viewport.width == 0 || spec.viewport.height == 0 { return Err("terminal test viewport cannot be zero-sized".into()); }
    Ok(spec)
}

pub fn run_json(json: &str) -> io::Result<()> {
    let spec = parse_spec(json).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    run_spec(spec)
}

pub fn run_from_file(path: impl AsRef<Path>) -> io::Result<()> {
    let json = fs::read_to_string(path)?;
    run_json(&json)
}

pub fn run_spec(spec: TerminalTestSpec) -> io::Result<()> {
    let mut terminal = ratatui::try_init()?;
    let mut state = RuntimeState::new(spec);
    let result = (|| -> io::Result<()> {
        while !state.should_quit {
            let delta = state.tick();
            terminal.draw(|frame| render_frame(frame, &mut state, delta))?;
            if event::poll(StdDuration::from_millis(16))? {
                if let Event::Key(key) = event::read()? { state.handle_key(key); }
            }
            if !state.spec.settings.r#loop && state.elapsed_ms > state.spec.scenario.duration_ms.saturating_add(60_000) {
                // Keep the terminal inspectable, but prevent accidental days-long
                // animation clocks from overflowing if a test is left open.
                state.elapsed_ms = state.spec.scenario.duration_ms.saturating_add(60_000);
            }
        }
        Ok(())
    })();
    ratatui::restore();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::{backend::TestBackend, buffer::Buffer, Terminal};

    const SPEC: &str = r#"{
      "schema":"syndrid-terminal-test/v1",
      "generatedAt":"2026-08-11T00:00:00Z",
      "viewport":{"id":"narrow","label":"Narrow","width":40,"height":12},
      "stateName":"loading",
      "scenario":{"id":"loading","name":"Loading","preset":"loading","seed":42,"durationMs":4000,"variables":{},"timeline":[]},
      "settings":{"speed":1,"reducedMotion":false,"loop":false,"fakeData":true,"interactive":true,"showDebugOverlay":false,"startAtMs":0},
      "nodes":[
        {"id":"root","name":"Root","type":"Screen","rect":{"x":0,"y":0,"width":40,"height":12},"props":{},"style":{"border":true},"events":{},"focusable":false,"focusOrder":0,"keyBindings":[]},
        {"id":"progress","name":"Progress","type":"ProgressBar","rect":{"x":2,"y":3,"width":30,"height":3},"props":{"value":0,"max":100},"style":{"border":true,"color":"brightCyan"},"events":{},"focusable":false,"focusOrder":1,"keyBindings":[]}
      ],
      "motion":[{"componentId":"progress","componentName":"Progress","effectId":"fade","effectName":"Fade","trigger":{"kind":"mount"},"target":{"kind":"component","componentId":"progress"},"area":{"x":2,"y":3,"width":30,"height":3},"dsl":"fx::dissolve(300)","reducedMotionDsl":"fx::dissolve(1)"}],
      "warnings":[],"fallbackText":""
    }"#;

    #[test]
    fn parses_preview_spec() {
        let spec = parse_spec(SPEC).expect("valid test spec");
        assert_eq!(spec.viewport.width, 40);
        assert_eq!(spec.nodes.len(), 2);
    }

    #[test]
    fn renders_real_ratatui_frame_and_tachyonfx() {
        let spec = parse_spec(SPEC).expect("valid test spec");
        let mut state = RuntimeState::new(spec);
        let backend = TestBackend::new(40, 12);
        let mut terminal = Terminal::new(backend).expect("terminal");
        terminal.draw(|frame| render_frame(frame, &mut state, StdDuration::from_millis(100))).expect("draw");
        let buffer = terminal.backend().buffer();
        assert_eq!(buffer.area, Rect::new(0, 0, 40, 12));
        assert!(!state.effect_errors.iter().any(|error| error.contains("dissolve")));
    }

    #[test]
    fn loading_progress_advances_deterministically() {
        let spec = parse_spec(SPEC).expect("valid test spec");
        let mut state = RuntimeState::new(spec);
        state.elapsed_ms = 2_000;
        let node = state.nodes.iter().find(|node| node.id == "progress").unwrap();
        let (ratio, _) = scenario_progress(&state, node).unwrap();
        assert!((ratio - 0.5).abs() < 0.001);
    }

    #[test]
    fn unicode_content_renders_without_panicking() {
        let mut spec = parse_spec(SPEC).expect("valid test spec");
        spec.nodes.push(PreviewNode {
            id: "unicode".into(), name: "Unicode".into(), r#type: "Text".into(),
            rect: PreviewRect { x: 1, y: 8, width: 30, height: 2 },
            props: Map::from_iter([("content".into(), Value::String("界 🚀 é".into()))]),
            style: Map::new(), events: Map::new(), focusable: false, focus_order: 2, key_bindings: Vec::new(),
        });
        let mut state = RuntimeState::new(spec);
        let backend = TestBackend::new(40, 12);
        let mut terminal = Terminal::new(backend).expect("terminal");
        terminal.draw(|frame| render_frame(frame, &mut state, StdDuration::ZERO)).expect("draw");
    }

    #[test]
    fn tachyon_dsl_compiles_against_runtime() {
        let motion = PreviewMotion {
            component_id: "x".into(), component_name: "X".into(), effect_id: "x".into(), effect_name: "X".into(),
            trigger: serde_json::json!({"kind":"mount"}), target: serde_json::json!({"kind":"component","componentId":"x"}),
            area: PreviewRect { x: 0, y: 0, width: 10, height: 2 }, dsl: "fx::dissolve(300)".into(), reduced_motion_dsl: "fx::dissolve(1)".into(),
        };
        let mut effect = compile_motion(&motion, false).expect("dsl compiles");
        let area = Rect::new(0, 0, 10, 2);
        let mut buffer = Buffer::empty(area);
        let _ = effect.process(StdDuration::from_millis(16).into(), &mut buffer, area);
    }
}
