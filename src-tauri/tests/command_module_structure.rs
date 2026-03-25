use std::path::PathBuf;

fn read_source(relative_path: &str) -> String {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(manifest_dir.join(relative_path)).expect("read source file")
}

#[test]
fn model_commands_stays_a_thin_command_surface() {
    let source = read_source("src/commands/model_commands.rs");

    let line_count = source.lines().count();
    assert!(
        line_count < 800,
        "model_commands.rs should stay a thin command/controller surface, found {} lines",
        line_count
    );

    for forbidden in [
        "pub(crate) async fn generate_kb_embeddings_internal",
        "pub(crate) fn load_model_impl",
        "pub(crate) async fn generate_with_context_impl",
    ] {
        assert!(
            !source.contains(forbidden),
            "model_commands.rs should delegate helper-heavy ownership instead of defining `{}`",
            forbidden
        );
    }
}

#[test]
fn commands_mod_avoids_blanket_command_reexports() {
    let source = read_source("src/commands/mod.rs");

    assert!(
        !source.contains("pub use app_core_commands::*"),
        "commands/mod.rs should not blanket re-export command modules"
    );
    assert!(
        !source.contains("pub use model_commands::*"),
        "commands/mod.rs should not blanket re-export model commands"
    );
}
