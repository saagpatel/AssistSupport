#[test]
fn engine_tests_share_the_process_wide_llama_backend() {
    let lib = include_str!("../src/lib.rs");
    let embeddings = include_str!("../src/kb/embeddings.rs");
    let llm = include_str!("../src/llm.rs");

    assert!(lib.contains("fn test_llama_backend()"));
    assert!(embeddings.contains("let backend = crate::test_llama_backend();"));
    assert_eq!(
        llm.matches("let backend = crate::test_llama_backend();")
            .count(),
        2
    );
    assert!(!embeddings.contains("LlamaBackend::init().expect(\"backend init\")"));
    assert!(!llm.contains("LlamaBackend::init().expect(\"backend init\")"));
}
