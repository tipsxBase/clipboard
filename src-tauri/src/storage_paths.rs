use std::fs;
use std::path::PathBuf;

/// Unified storage path abstraction.
///
/// All persistent data lives under a single root (`~/.clipboard-manager`).
/// Temporary screenshot cache uses the system temp directory.
pub struct StoragePaths {
    /// Long-term data root: `~/.clipboard-manager`
    root: PathBuf,
    /// Temporary screenshot cache: `{temp_dir}/clipboard-manager-screenshots`
    temp_screenshot_dir: PathBuf,
}

impl StoragePaths {
    /// Create a new `StoragePaths` from the user's HOME directory.
    pub fn new() -> Self {
        let root = std::env::var("HOME")
            .map(|h| PathBuf::from(h).join(".clipboard-manager"))
            .unwrap_or_else(|_| PathBuf::from(".clipboard-manager"));

        let temp_screenshot_dir = std::env::temp_dir().join("clipboard-manager-screenshots");

        Self {
            root,
            temp_screenshot_dir,
        }
    }

    /// Ensure all required directories exist.
    pub fn ensure_dirs(&self) -> Result<(), String> {
        let dirs = [
            &self.root,
            &self.images_dir(),
            &self.captures_dir(),
            &self.temp_screenshot_dir,
        ];
        for dir in dirs {
            if !dir.exists() {
                fs::create_dir_all(dir)
                    .map_err(|e| format!("Failed to create directory {:?}: {}", dir, e))?;
            }
        }
        Ok(())
    }

    /// Long-term data root directory.
    pub fn root(&self) -> &PathBuf {
        &self.root
    }

    /// Path to `clipboard.clipdb`.
    pub fn db_path(&self) -> PathBuf {
        self.root.join("clipboard.clipdb")
    }

    /// Path to `secret.key`.
    pub fn key_path(&self) -> PathBuf {
        self.root.join("secret.key")
    }

    /// Directory for clipboard image history: `{root}/images/`.
    pub fn images_dir(&self) -> PathBuf {
        self.root.join("images")
    }

    /// Directory for confirmed screenshot saves: `{root}/captures/`.
    pub fn captures_dir(&self) -> PathBuf {
        self.root.join("captures")
    }

    /// Temporary screenshot cache directory (system temp).
    pub fn temp_screenshot_dir(&self) -> &PathBuf {
        &self.temp_screenshot_dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_are_under_root() {
        let sp = StoragePaths::new();
        let root = sp.root().clone();
        assert!(sp.db_path().starts_with(&root));
        assert!(sp.key_path().starts_with(&root));
        assert!(sp.images_dir().starts_with(&root));
        assert!(sp.captures_dir().starts_with(&root));
    }

    #[test]
    fn temp_dir_is_separate_from_root() {
        let sp = StoragePaths::new();
        assert!(!sp.temp_screenshot_dir().starts_with(sp.root()));
    }

    #[test]
    fn expected_filenames() {
        let sp = StoragePaths::new();
        assert_eq!(sp.db_path().file_name().unwrap(), "clipboard.clipdb");
        assert_eq!(sp.key_path().file_name().unwrap(), "secret.key");
    }
}
