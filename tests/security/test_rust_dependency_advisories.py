import tomllib
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CARGO_TOML = ROOT / "src-tauri" / "Cargo.toml"
CARGO_LOCK = ROOT / "src-tauri" / "Cargo.lock"
WORKFLOW = ROOT / ".github" / "workflows" / "dependency-watch.yml"
AUDIT_WRAPPER = ROOT / "scripts" / "security" / "run-cargo-audit.sh"


def version_tuple(value: str) -> tuple[int, ...]:
    parts = [int(part) for part in value.split(".")[:3]]
    return tuple(parts + [0] * (3 - len(parts)))


class RustDependencyAdvisoryTests(unittest.TestCase):
    def test_vulnerable_quick_xml_is_confined_to_trusted_build_time_generator(self):
        lock = tomllib.loads(CARGO_LOCK.read_text(encoding="utf-8"))
        packages = lock["package"]
        vulnerable = {
            package["version"]
            for package in packages
            if package["name"] == "quick-xml" and version_tuple(package["version"]) < (0, 41, 0)
        }
        vulnerable_refs = {f"quick-xml {version}" for version in vulnerable}
        parents = {
            package["name"]
            for package in packages
            if vulnerable_refs.intersection(package.get("dependencies", []))
        }
        self.assertEqual(parents, {"wayland-scanner"})

        for runtime_parent in ("calamine", "plist"):
            package = next(package for package in packages if package["name"] == runtime_parent)
            quick_xml_refs = [dep for dep in package.get("dependencies", []) if dep.startswith("quick-xml")]
            self.assertTrue(quick_xml_refs, f"{runtime_parent} must retain its XML parser dependency")
            self.assertTrue(
                all(version_tuple(dep.split()[-1]) >= (0, 41, 0) for dep in quick_xml_refs),
                f"{runtime_parent} runtime XML path must use quick-xml >=0.41.0: {quick_xml_refs}",
            )

    def test_calamine_direct_requirement_stays_on_patched_dependency_line(self):
        manifest = tomllib.loads(CARGO_TOML.read_text(encoding="utf-8"))
        requirement = manifest["dependencies"]["calamine"]
        self.assertGreaterEqual(version_tuple(requirement), (0, 36, 0))

    def test_workflow_uses_canonical_issue_backed_audit_policy(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        wrapper = AUDIT_WRAPPER.read_text(encoding="utf-8")
        self.assertGreaterEqual(workflow.count("../scripts/security/run-cargo-audit.sh"), 2)
        self.assertIn('"$@"', wrapper)
        self.assertIn("https://github.com/saagpatel/AssistSupport/issues/178", wrapper)
        for advisory in ("RUSTSEC-2026-0194", "RUSTSEC-2026-0195"):
            self.assertEqual(wrapper.count(f"--ignore {advisory}"), 1)
        self.assertIn("wayland-scanner", wrapper)
        self.assertNotIn("constrained by calamine and Tauri/plist", wrapper)


if __name__ == "__main__":
    unittest.main()
