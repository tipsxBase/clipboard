use crate::db::Database;
use crate::models::ClipboardItem;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

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

/// Default rules for blocking password managers.
pub fn get_default_rules() -> Vec<Rule> {
    vec![
        Rule {
            id: "preset-1password".to_string(),
            name: "屏蔽 1Password".to_string(),
            enabled: true,
            conditions: vec![RuleCondition {
                field: "source_app".to_string(),
                operator: "contains".to_string(),
                value: "1Password".to_string(),
            }],
            action: RuleAction {
                action_type: "ignore".to_string(),
                collection_id: None,
            },
        },
        Rule {
            id: "preset-keychain".to_string(),
            name: "屏蔽 Keychain Access".to_string(),
            enabled: true,
            conditions: vec![RuleCondition {
                field: "source_app".to_string(),
                operator: "contains".to_string(),
                value: "Keychain Access".to_string(),
            }],
            action: RuleAction {
                action_type: "ignore".to_string(),
                collection_id: None,
            },
        },
        Rule {
            id: "preset-bitwarden".to_string(),
            name: "屏蔽 Bitwarden".to_string(),
            enabled: true,
            conditions: vec![RuleCondition {
                field: "source_app".to_string(),
                operator: "contains".to_string(),
                value: "Bitwarden".to_string(),
            }],
            action: RuleAction {
                action_type: "ignore".to_string(),
                collection_id: None,
            },
        },
        Rule {
            id: "preset-lastpass".to_string(),
            name: "屏蔽 LastPass".to_string(),
            enabled: true,
            conditions: vec![RuleCondition {
                field: "source_app".to_string(),
                operator: "contains".to_string(),
                value: "LastPass".to_string(),
            }],
            action: RuleAction {
                action_type: "ignore".to_string(),
                collection_id: None,
            },
        },
        Rule {
            id: "preset-keepassxc".to_string(),
            name: "屏蔽 KeePassXC".to_string(),
            enabled: true,
            conditions: vec![RuleCondition {
                field: "source_app".to_string(),
                operator: "contains".to_string(),
                value: "KeePassXC".to_string(),
            }],
            action: RuleAction {
                action_type: "ignore".to_string(),
                collection_id: None,
            },
        },
        Rule {
            id: "preset-enpass".to_string(),
            name: "屏蔽 Enpass".to_string(),
            enabled: true,
            conditions: vec![RuleCondition {
                field: "source_app".to_string(),
                operator: "contains".to_string(),
                value: "Enpass".to_string(),
            }],
            action: RuleAction {
                action_type: "ignore".to_string(),
                collection_id: None,
            },
        },
        Rule {
            id: "preset-dashlane".to_string(),
            name: "屏蔽 Dashlane".to_string(),
            enabled: true,
            conditions: vec![RuleCondition {
                field: "source_app".to_string(),
                operator: "contains".to_string(),
                value: "Dashlane".to_string(),
            }],
            action: RuleAction {
                action_type: "ignore".to_string(),
                collection_id: None,
            },
        },
    ]
}

/// Manages rule definitions and evaluates them against clipboard items.
/// Rules are stored in the database, not in JSON files.
pub struct RulesEngine {
    db: Arc<Database>,
}

impl RulesEngine {
    /// Create a new RulesEngine with database backend.
    /// Initializes default rules if database is empty.
    pub fn new(db: Arc<Database>) -> Self {
        // Initialize default rules if database is empty
        let rules = db.get_rules().unwrap_or_default();
        if rules.is_empty() {
            for rule in get_default_rules() {
                if let Err(e) = db.add_rule(&rule) {
                    log::error!("Failed to add default rule '{}': {}", rule.name, e);
                }
            }
            log::info!("Initialized default password manager blocking rules");
        }

        Self { db }
    }

    /// Get all rules from database.
    pub fn get_rules(&self) -> Vec<Rule> {
        self.db.get_rules().unwrap_or_default()
    }

    /// Add a new rule to database.
    pub fn add_rule(&self, rule: &Rule) -> Result<(), String> {
        self.db.add_rule(rule).map_err(|e| e.to_string())
    }

    /// Update an existing rule in database.
    pub fn update_rule(&self, rule: &Rule) -> Result<(), String> {
        self.db.update_rule(rule).map_err(|e| e.to_string())
    }

    /// Delete a rule from database.
    pub fn delete_rule(&self, id: &str) -> Result<(), String> {
        self.db.delete_rule(id).map_err(|e| e.to_string())
    }

    /// Evaluate all enabled rules against a clipboard item.
    ///
    /// Rules are evaluated in order. The first "ignore" rule wins immediately.
    /// All other matching rules accumulate modifications on the item.
    pub fn evaluate(&self, item: &ClipboardItem) -> RuleOutcome {
        let rules = self.get_rules();
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
            "favorite" => {} // deprecated, no-op
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

    #[test]
    fn default_rules_are_created() {
        let rules = get_default_rules();
        assert_eq!(rules.len(), 7);
        assert!(rules.iter().all(|r| r.enabled));
        assert!(rules.iter().all(|r| r.action.action_type == "ignore"));
    }

    #[test]
    fn source_app_condition_matches() {
        let rule = Rule {
            id: "test".to_string(),
            name: "Block 1Password".to_string(),
            enabled: true,
            conditions: vec![RuleCondition {
                field: "source_app".to_string(),
                operator: "contains".to_string(),
                value: "1Password".to_string(),
            }],
            action: RuleAction {
                action_type: "ignore".to_string(),
                collection_id: None,
            },
        };

        let mut item = text_item("secret");
        item.source_app = Some("1Password 7".to_string());

        let engine = RulesEngine::new(Arc::new(crate::db::Database::new(
            std::env::temp_dir().join("test_rules.db"),
            Arc::new(crate::crypto::Crypto::new(&std::env::temp_dir().join("test.key"))),
        ).unwrap()));

        // First clear any existing rules and add our test rule
        for r in engine.get_rules() {
            engine.delete_rule(&r.id).unwrap();
        }
        engine.add_rule(&rule).unwrap();

        match engine.evaluate(&item) {
            RuleOutcome::Ignore { rule_name } => assert_eq!(rule_name, "Block 1Password"),
            _ => panic!("Expected Ignore"),
        }
    }

    #[test]
    fn content_type_condition_matches() {
        let rule = Rule {
            id: "test2".to_string(),
            name: "Sensitive emails".to_string(),
            enabled: true,
            conditions: vec![RuleCondition {
                field: "content_type".to_string(),
                operator: "equals".to_string(),
                value: "email".to_string(),
            }],
            action: RuleAction {
                action_type: "mark_sensitive".to_string(),
                collection_id: None,
            },
        };

        let mut item = text_item("user@example.com");
        item.data_type = "email".to_string();

        let engine = RulesEngine::new(Arc::new(crate::db::Database::new(
            std::env::temp_dir().join("test_rules2.db"),
            Arc::new(crate::crypto::Crypto::new(&std::env::temp_dir().join("test2.key"))),
        ).unwrap()));

        for r in engine.get_rules() {
            engine.delete_rule(&r.id).unwrap();
        }
        engine.add_rule(&rule).unwrap();

        match engine.evaluate(&item) {
            RuleOutcome::Modify { item, applied_rules } => {
                assert!(item.is_sensitive);
                assert_eq!(applied_rules, vec!["Sensitive emails"]);
            }
            _ => panic!("Expected Modify"),
        }
    }
}