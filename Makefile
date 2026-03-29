.PHONY: build release test fmt clippy clean

build:
	cargo build

release:
	cargo build --release

test:
	cargo test --all-features

fmt:
	cargo fmt -- --check

clippy:
	cargo clippy --all-targets --all-features -- -D warnings

clean:
	cargo clean
