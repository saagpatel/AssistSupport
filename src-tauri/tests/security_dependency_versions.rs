//! Dependency pinning checks for security-alert remediations.

use std::fs;

fn cargo_lock() -> String {
    fs::read_to_string(format!("{}/Cargo.lock", env!("CARGO_MANIFEST_DIR")))
        .expect("Cargo.lock should be readable")
}

fn optional_package_versions<'a>(lockfile: &'a str, package_name: &str) -> Vec<&'a str> {
    lockfile
        .split("[[package]]")
        .filter_map(|package| {
            let mut name = None;
            let mut version = None;

            for line in package.lines() {
                if let Some(value) = line.strip_prefix("name = \"") {
                    name = value.strip_suffix('"');
                }

                if let Some(value) = line.strip_prefix("version = \"") {
                    version = value.strip_suffix('"');
                }
            }

            (name == Some(package_name)).then_some(version).flatten()
        })
        .collect()
}

fn package_versions<'a>(lockfile: &'a str, package_name: &str) -> Vec<&'a str> {
    let versions = optional_package_versions(lockfile, package_name);

    assert!(
        !versions.is_empty(),
        "{package_name} should be present in Cargo.lock"
    );

    versions
}

fn package_version<'a>(lockfile: &'a str, package_name: &str) -> &'a str {
    let versions = package_versions(lockfile, package_name);

    assert_eq!(
        versions.len(),
        1,
        "{package_name} should have one locked version; found {versions:?}"
    );

    versions[0]
}

fn version_tuple(version: &str) -> (u64, u64, u64) {
    let mut parts = version.split('.').map(|part| {
        part.parse::<u64>()
            .unwrap_or_else(|_| panic!("{version} should contain numeric version parts"))
    });

    let major = parts
        .next()
        .unwrap_or_else(|| panic!("{version} should include a major version"));
    let minor = parts
        .next()
        .unwrap_or_else(|| panic!("{version} should include a minor version"));
    let patch = parts
        .next()
        .unwrap_or_else(|| panic!("{version} should include a patch version"));

    assert!(
        parts.next().is_none(),
        "{version} should only include major.minor.patch"
    );

    (major, minor, patch)
}

fn assert_package_at_least(lockfile: &str, package_name: &str, minimum: &str) {
    let actual = package_version(lockfile, package_name);

    assert!(
        version_tuple(actual) >= version_tuple(minimum),
        "{package_name} should stay on at least {minimum}; found {actual}"
    );
}

#[test]
fn cargo_lock_uses_patched_openssl() {
    let lockfile = cargo_lock();
    let openssl_versions = optional_package_versions(&lockfile, "openssl");

    assert!(
        openssl_versions
            .iter()
            .all(|version| version_tuple(version) >= version_tuple("0.10.79")),
        "openssl should be absent or stay on at least 0.10.79; found {openssl_versions:?}"
    );
    assert_package_at_least(&lockfile, "openssl-sys", "0.9.116");
}

#[test]
fn cargo_lock_uses_patched_hickory_proto() {
    let lockfile = cargo_lock();

    assert_package_at_least(&lockfile, "hickory-proto", "0.26.1");
}

#[test]
fn cargo_lock_uses_patched_lz4_flex() {
    let lockfile = cargo_lock();
    let versions = package_versions(&lockfile, "lz4_flex");

    assert!(
        versions.iter().all(|version| {
            let parsed = version_tuple(version);
            parsed > version_tuple("0.11.5") && parsed != version_tuple("0.12.0")
        }),
        "lz4_flex should stay outside vulnerable ranges <=0.11.5 and 0.12.0; found {versions:?}"
    );
}
