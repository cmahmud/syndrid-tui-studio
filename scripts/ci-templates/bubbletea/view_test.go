package main

import "testing"

// Smoke test: the generated model must build View() without a real
// terminal or program loop. Content assertions live in the exporter's
// own vitest snapshot/regression tests — this only proves the file the
// exporter emits compiles and runs against the real bubbletea/lipgloss.
func TestView(t *testing.T) {
	_ = model{}.View()
}
