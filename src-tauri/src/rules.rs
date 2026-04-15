use crate::models::ClipboardItem;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

/// A single automation rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub conditions: Vec<RuleCondition>,
    pub action: RuleAction,
}

/// A match condition evaluated against captured clipboard content.
///
/// Supported fields:
/// - `"source_app"`: the name of the app the content came from
/// - `"content_type"`: the `data_type` / `kind` of the item (e.g. "text", "url", "image")
/// - `"content"`: the text content of the item
///
/// Supported operators:
/// - `"equals"`: exact (case-insensitive) match
/// - `"contains"`: substring (case-insensitive) match
/// - `"matches"`: regex match
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleCondition {
    pub field: String,
    pub operator: String,
    pub value: String,
}

/// The action to perform when all conditions of a rule match.
///
/// Supported action types:
/// - `"ignore"`: skip the item entirely (do not persist)
/// - `"mark_sensitive"`: set `is_sensitive = true`
/// - `"pin"`: set `is_pinned = true`
/// - `"snippet"`: set `is_snippet = true`
/// - `"add_to_collection"`: assign `collection_id`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleAction {
    pub action_type: String,
    #[serde(default)]
    pub collection_id: Option<i64>,
}

/// The outcome of evaluating all rules against a clipboard item.
pub enum RuleOutcome {
    /// The item should be ignored (not persisted).
    Ignore { rule_name: String },
    /// The item should be modified before persisting.
    Modify {
        item: ClipboardItem,
        applied_rules: Vec<String>,
    },
    /// No rules matched; proceed as normal.
    Pass,
}

/// Manages rule definitions and evaluates them against clipboard items.
pub struct RulesEngine {
    rules: Arc<Mutex<Vec<Rule>>>,
    rules_path: std::path::PathBuf,
}

impl RulesEngine {
    /// Load rules from a JSON file, or start with an empty list.
    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        let rules_path = path.as_ref().to_path_buf();
        let rules = if rules_path.exists() {
            match fs::read_to_string(&rules_path) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(_) => Vec::new(),
            }
        } else {
            Vec::new()
        };

        Self {
            rules: Arc::new(Mutex::new(rules)),
            rules_path,
        }
    }

    /// Persist current rules to disk.
    fn save(&self) -> Result<(), String> {
        let rules = self.rules.lock().unwrap();
        let json = serde_json::to_string_pretty(&*rules).map_err(|e| e.to_string())?;
        fs::write(&self.rules_path, json).map_err(|e| e.to_string())
    }

    /// Get all rules.
    pub fn get_rules(&self) -> Vec<Rule> {
        self.rules.lock().unwrap().clone()
    }

    /// Add a new rule.
    pub fn add_rule(&self, rule: Rule) -> Result<(), String> {
        {
            let mut rules = self.rules.lock().unwrap();
            rules.push(rule);
        }
        self.save()
    }

    /// Update an existing rule by id.
    pub fn update_rule(&self, updated: Rule) -> Result<(), String> {
        {
            let mut rules = self.rules.lock().unwrap();
            if let Some(r) = rules.iter_mut().find(|r| r.id == updated.id) {
                *r = updated;
            } else {
                return Err("Rule not found".to_string());
            }
        }
        self.save()
    }

    /// Delete a rule by id.
    pub fn delete_rule(&self, id: &str) -> Result<(), String> {
        {
            let mut rules = self.rules.lock().unwrap();
            let before = rules.len();
            rules.retain(|r| r.id != id);
            if rules.len() == before {
                return Err("Rule not found".to_string());
            }
        }
        self.save()
    }

    /// Evaluate all enabled rules against a clipboard item.
    ///
    /// Rules are evaluated in order. The first "ignore" rule wins immediately.
    /// All other matching rules accumulate modifications on the item.
    pub fn evaluate(&self, item: &ClipboardItem) -> RuleOutcome {
        let rules = self.rules.lock().unwrap();
        let mut modified = item.clone();
        let mut applied: Vec<String> = Vec::new();

        for rule in rules.iter().filter(|r| r.enabled) {
            if self.matches_all_conditions(rule, item) {
                if rule.action.action_type == "ignore" {
                    return RuleOutcome::Ignore {
                        rule_name: rule.name.clone(),
                    };
                }
                self.apply_action(&rule.action, &mut modified);
                applied.push(rule.name.clone());
            }
        }

        if applied.is_empty() {
            RuleOutcome::Pass
        } else {
            RuleOutcome::Modify {
                item: modified,
                applied_rules: applied,
            }
        }
    }

    /// Check whether all conditions of a rule match the given item.
    fn matches_all_conditions(&self, rule: &Rule, item: &ClipboardItem) -> bool {
        rule.conditions
            .iter()
            .all(|c| self.matches_condition(c, item))
    }

    /// Evaluate a single condition against the item.
    fn matches_condition(&self, cond: &RuleCondition, item: &ClipboardItem) -> bool {
        let field_value = match cond.field.as_str() {
            "source_app" => item.source_app.as_deref().unwrap_or(""),
            "content_type" => &item.data_type,
            "content" => &item.content,
            _ => return false,
        };

        match cond.operator.as_str() {
            "equals" => field_value.eq_ignore_ascii_case(&cond.value),
            "contains" => field_value
                .to_lowercase()
                .contains(&cond.value.to_lowercase()),
            "matches" => Regex::new(&cond.value)
                .map(|re| re.is_match(field_value))
                .unwrap_or(false),
            _ => false,
        }
    }

    /// Apply a rule action to modify the item in place.
    fn apply_action(&self, action: &RuleAction, item: &mut ClipboardItem) {
        match action.action_type.as_str() {
            "mark_sensitive" => item.is_sensitive = true,
            "pin" => item.is_pinned = true,
            "snippet" => item.is_snippet = true,
            "add_to_collection" => item.collection_id = action.collection_id,
            // "favorite" is deprecated, treated as add_to_collection with no specific collection
            "favorite" => {} // no-op since is_favorite field is removed
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_item(content: &str) -> ClipboardItem {
        ClipboardItem {
            id: None,
            content: content.to_string(),
            kind: "text".to_string(),
            timestamp: "2024-01-01 00:00:00".to_string(),
            is_sensitive: false,
            is_pinned: false,
            source_app: None,
            data_type: "text".to_string(),
            collection_id: None,
            note: None,
            html_content: None,
            is_snippet: false,
            screenshot_id: None,
        }
    }

    fn make_engine() -> RulesEngine {
        let tmp = std::env::temp_dir().join(format!("rules_test_{}.json", std::process::id()));
        RulesEngine::new(&tmp)
    }

    #[test]
    fn source_app_ignore_rule() {
        let engine = make_engine();
        engine
            .add_rule(Rule {
                id: "r1".into(),
                name: "Block 1Password".into(),
                enabled: true,
                conditions: vec![RuleCondition {
                    field: "source_app".into(),
                    operator: "contains".into(),
                    value: "1Password".into(),
                }],
                action: RuleAction {
                    action_type: "ignore".into(),
                    collection_id: None,
                },
            })
            .unwrap();

        let mut item = text_item("secret");
        item.source_app = Some("1Password 7".into());

        match engine.evaluate(&item) {
            RuleOutcome::Ignore { rule_name } => assert_eq!(rule_name, "Block 1Password"),
            _ => panic!("Expected Ignore"),
        }
    }

    #[test]
    fn content_type_mark_sensitive() {
        let engine = make_engine();
        engine
            .add_rule(Rule {
                id: "r2".into(),
                name: "Sensitive emails".into(),
                enabled: true,
                conditions: vec![RuleCondition {
                    field: "content_type".into(),
                    operator: "equals".into(),
                    value: "email".into(),
                }],
                action: RuleAction {
                    action_type: "mark_sensitive".into(),
                    collection_id: None,
                },
            })
            .unwrap();

        let mut item = text_item("user@example.com");
        item.data_type = "email".to_string();

        match engine.evaluate(&item) {
            RuleOutcome::Modify {
                item,
                applied_rules,
            } => {
                assert!(item.is_sensitive);
                assert_eq!(applied_rules, vec!["Sensitive emails"]);
            }
            _ => panic!("Expected Modify"),
        }
    }

    #[test]
    fn content_pattern_regex_match() {
        let engine = make_engine();
        engine
            .add_rule(Rule {
                id: "r3".into(),
                name: "Pin URLs".into(),
                enabled: true,
                conditions: vec![RuleCondition {
                    field: "content".into(),
                    operator: "matches".into(),
                    value: r"^https?://".into(),
                }],
                action: RuleAction {
                    action_type: "pin".into(),
                    collection_id: None,
                },
            })
            .unwrap();

        let item = text_item("https://example.com");

        match engine.evaluate(&item) {
            RuleOutcome::Modify { item, .. } => assert!(item.is_pinned),
            _ => panic!("Expected Modify"),
        }

        // Non-matching
        let item2 = text_item("just some text");
        match engine.evaluate(&item2) {
            RuleOutcome::Pass => {}
            _ => panic!("Expected Pass"),
        }
    }

    #[test]
    fn disabled_rule_is_skipped() {
        let engine = make_engine();
        engine
            .add_rule(Rule {
                id: "r4".into(),
                name: "Disabled".into(),
                enabled: false,
                conditions: vec![RuleCondition {
                    field: "content".into(),
                    operator: "contains".into(),
                    value: "test".into(),
                }],
                action: RuleAction {
                    action_type: "ignore".into(),
                    collection_id: None,
                },
            })
            .unwrap();

        let item = text_item("test content");
        match engine.evaluate(&item) {
            RuleOutcome::Pass => {}
            _ => panic!("Expected Pass for disabled rule"),
        }
    }

    #[test]
    fn multiple_rules_accumulate() {
        let engine = make_engine();
        engine
            .add_rule(Rule {
                id: "r5".into(),
                name: "Snippet URLs".into(),
                enabled: true,
                conditions: vec![RuleCondition {
                    field: "content_type".into(),
                    operator: "equals".into(),
                    value: "url".into(),
                }],
                action: RuleAction {
                    action_type: "snippet".into(),
                    collection_id: None,
                },
            })
            .unwrap();
        engine
            .add_rule(Rule {
                id: "r6".into(),
                name: "Pin URLs".into(),
                enabled: true,
                conditions: vec![RuleCondition {
                    field: "content_type".into(),
                    operator: "equals".into(),
                    value: "url".into(),
                }],
                action: RuleAction {
                    action_type: "pin".into(),
                    collection_id: None,
                },
            })
            .unwrap();

        let mut item = text_item("https://example.com");
        item.data_type = "url".to_string();

        match engine.evaluate(&item) {
            RuleOutcome::Modify {
                item,
                applied_rules,
            } => {
                assert!(item.is_snippet);
                assert!(item.is_pinned);
                assert_eq!(applied_rules.len(), 2);
            }
            _ => panic!("Expected Modify"),
        }
    }

    #[test]
    fn ignore_wins_over_modify() {
        let engine = make_engine();
        engine
            .add_rule(Rule {
                id: "r7".into(),
                name: "Ignore first".into(),
                enabled: true,
                conditions: vec![RuleCondition {
                    field: "content".into(),
                    operator: "contains".into(),
                    value: "secret".into(),
                }],
                action: RuleAction {
                    action_type: "ignore".into(),
                    collection_id: None,
                },
            })
            .unwrap();
        engine
            .add_rule(Rule {
                id: "r8".into(),
                name: "Pin after".into(),
                enabled: true,
                conditions: vec![RuleCondition {
                    field: "content".into(),
                    operator: "contains".into(),
                    value: "secret".into(),
                }],
                action: RuleAction {
                    action_type: "pin".into(),
                    collection_id: None,
                },
            })
            .unwrap();

        let item = text_item("my secret value");
        match engine.evaluate(&item) {
            RuleOutcome::Ignore { .. } => {}
            _ => panic!("Expected Ignore to win"),
        }
    }

    #[test]
    fn add_to_collection_action() {
        let engine = make_engine();
        engine
            .add_rule(Rule {
                id: "r9".into(),
                name: "Collect code".into(),
                enabled: true,
                conditions: vec![RuleCondition {
                    field: "content_type".into(),
                    operator: "equals".into(),
                    value: "code".into(),
                }],
                action: RuleAction {
                    action_type: "add_to_collection".into(),
                    collection_id: Some(42),
                },
            })
            .unwrap();

        let mut item = text_item("fn main() {}");
        item.data_type = "code".to_string();

        match engine.evaluate(&item) {
            RuleOutcome::Modify { item, .. } => {
                assert_eq!(item.collection_id, Some(42));
            }
            _ => panic!("Expected Modify"),
        }
    }

    #[test]
    fn crud_operations() {
        let engine = make_engine();
        assert_eq!(engine.get_rules().len(), 0);

        engine
            .add_rule(Rule {
                id: "c1".into(),
                name: "Test".into(),
                enabled: true,
                conditions: vec![],
                action: RuleAction {
                    action_type: "pin".into(),
                    collection_id: None,
                },
            })
            .unwrap();
        assert_eq!(engine.get_rules().len(), 1);

        engine
            .update_rule(Rule {
                id: "c1".into(),
                name: "Updated".into(),
                enabled: false,
                conditions: vec![],
                action: RuleAction {
                    action_type: "pin".into(),
                    collection_id: None,
                },
            })
            .unwrap();
        assert_eq!(engine.get_rules()[0].name, "Updated");
        assert!(!engine.get_rules()[0].enabled);

        engine.delete_rule("c1").unwrap();
        assert_eq!(engine.get_rules().len(), 0);
    }
}
