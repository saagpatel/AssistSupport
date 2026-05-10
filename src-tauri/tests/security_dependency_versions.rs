//! Dependency pinning checks for security-alert remediations.

use std::fs;

fn cargo_lock() -> String {
    fs::read_to_string(format!("{}/Cargo.lock", env!("CARGO_MANIFEST_DIR")))
        .expect("Cargo.lock should be readable")
}

#[test]
fn cargo_lock_uses_patched_openssl() {
    let lockfile = cargo_lock();

    assert!(
        lockfile.contains("name = \"openssl\"\nversion = \"0.10.79\""),
        "openssl should stay on the patched 0.10.79 release"
    );
}

#[test]
fn cargo_lock_uses_patched_hickory_proto() {
    let lockfile = cargo_lock();

    assert!(
        lockfile.contains("name = \"hickory-proto\"\nversion = \"0.26.1\""),
        "hickory-proto should stay on the patched 0.26.1 release"
    );
}
