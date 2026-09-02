//! What a node's access-control policy would do to a key expression.
//!
//! ACL is the quietest failure Zenoh has. A node configured to deny
//! `declare_subscriber` on `demo/**` does not refuse the subscription, log at
//! you, or answer differently — the samples simply never arrive, and every
//! other diagnostic in this app says the network is healthy, because it is.
//!
//! So the explorer reads the policy and says what it would do. The judgement
//! comes from `zenoh-keyexpr` through [`crate::keyexpr_tools`], not from a
//! second matcher, because "does this rule cover the key I just tapped" is the
//! same set question the key-expression tester already answers.
//!
//! Two subtleties that make the difference between a useful answer and a
//! misleading one:
//!
//! - A rule does nothing until a POLICY binds it to a subject. Reporting every
//!   rule in the file would flag deployments where the rule is inert.
//! - ACL cannot be changed at runtime; it is read once at startup. So a policy
//!   read from the admin space is the policy in force, and nothing has to be
//!   re-read when the network moves.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::keyexpr_tools::{self, Relation};

/// Whether a rule lets a message through or stops it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum AclPermission {
    Allow,
    Deny,
}

/// Which direction a rule applies to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum AclFlow {
    /// Messages arriving at the node.
    Ingress,
    /// Messages leaving it.
    Egress,
}

/// One rule, as configured.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AclRule {
    pub id: String,
    pub permission: AclPermission,
    /// Empty means both directions, which is Zenoh's default for the field.
    #[serde(default)]
    pub flows: Vec<AclFlow>,
    /// Message kinds, as Zenoh spells them: `declare_subscriber`, `put`, …
    #[serde(default)]
    pub messages: Vec<String>,
    #[serde(default)]
    pub key_exprs: Vec<String>,
}

/// One policy: which rules apply to which subjects.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AclPolicy {
    #[serde(default)]
    pub rules: Vec<String>,
    #[serde(default)]
    pub subjects: Vec<String>,
}

/// A node's whole access-control configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AclSummary {
    /// ACL does nothing at all unless this is set.
    #[serde(default)]
    pub enabled: bool,
    /// Applied to messages no policy matched. `allow` or `deny`.
    #[serde(default)]
    pub default_permission: Option<AclPermission>,
    #[serde(default)]
    pub rules: Vec<AclRule>,
    #[serde(default)]
    pub policies: Vec<AclPolicy>,
    /// How many subjects are configured. The ids are not carried: matching a
    /// subject needs the interface, certificate name or username of the far
    /// end, which the explorer cannot know for somebody else's session.
    #[serde(default)]
    pub subjects: usize,
}

impl AclSummary {
    /// The rules some policy actually binds to a subject.
    ///
    /// A rule that no policy references is configured and inert. Reporting it
    /// would send someone looking for a filter that is not filtering.
    #[must_use]
    pub fn active_rules(&self) -> Vec<&AclRule> {
        self.rules
            .iter()
            .filter(|rule| {
                self.policies
                    .iter()
                    .any(|policy| policy.rules.iter().any(|id| id == &rule.id))
            })
            .collect()
    }
}

/// One reason a key expression might not behave as expected on one node.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AclFinding {
    /// The node whose policy this is.
    pub zid: String,
    pub node_name: Option<String>,
    pub rule_id: String,
    pub permission: AclPermission,
    pub flows: Vec<AclFlow>,
    /// The message kind that matched, as configured.
    pub message: String,
    /// The rule's expression, not the one asked about.
    pub key_expr: String,
    /// How the rule's expression relates to the one asked about.
    pub relation: Option<Relation>,
}

/// A node's policy, paired with enough to name it in a finding.
#[derive(Debug)]
pub struct PolicyHolder<'a> {
    pub zid: &'a str,
    pub name: Option<&'a str>,
    pub acl: &'a AclSummary,
}

/// Every active rule that covers `key_expr` for `message`.
///
/// Ordered deny-first: a single deny is the answer to "why is nothing
/// arriving", and an allow among a hundred rules is not news.
#[must_use]
pub fn findings(holders: &[PolicyHolder<'_>], key_expr: &str, message: &str) -> Vec<AclFinding> {
    let mut out = Vec::new();

    for holder in holders {
        if !holder.acl.enabled {
            continue;
        }

        for rule in holder.acl.active_rules() {
            // An empty `messages` list is not "all messages" in Zenoh's schema:
            // the field is required for a rule to do anything, so a rule
            // without it is treated as naming nothing.
            if !rule.messages.iter().any(|named| named == message) {
                continue;
            }

            let relations = keyexpr_tools::test_matches(key_expr, &rule.key_exprs);
            for (candidate, result) in rule.key_exprs.iter().zip(relations) {
                if !result.matches {
                    continue;
                }

                out.push(AclFinding {
                    zid: holder.zid.to_owned(),
                    node_name: holder.name.map(std::borrow::ToOwned::to_owned),
                    rule_id: rule.id.clone(),
                    permission: rule.permission,
                    // Empty means both, which is what Zenoh does with the field.
                    flows: if rule.flows.is_empty() {
                        vec![AclFlow::Ingress, AclFlow::Egress]
                    } else {
                        rule.flows.clone()
                    },
                    message: message.to_owned(),
                    key_expr: candidate.clone(),
                    relation: result.relation,
                });
            }
        }
    }

    out.sort_by_key(|finding| match finding.permission {
        AclPermission::Deny => 0,
        AclPermission::Allow => 1,
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deny_subscribe_on(key_expr: &str) -> AclSummary {
        AclSummary {
            enabled: true,
            default_permission: Some(AclPermission::Allow),
            rules: vec![AclRule {
                id: "deny pub/sub".to_owned(),
                permission: AclPermission::Deny,
                flows: vec![AclFlow::Ingress, AclFlow::Egress],
                messages: vec!["declare_subscriber".to_owned(), "put".to_owned()],
                key_exprs: vec![key_expr.to_owned()],
            }],
            policies: vec![AclPolicy {
                rules: vec!["deny pub/sub".to_owned()],
                subjects: vec!["everyone".to_owned()],
            }],
            subjects: 1,
        }
    }

    fn holders(acl: &AclSummary) -> Vec<PolicyHolder<'_>> {
        vec![PolicyHolder {
            zid: "aaaa",
            name: Some("router-1"),
            acl,
        }]
    }

    #[test]
    fn finds_a_deny_that_covers_the_key() {
        let acl = deny_subscribe_on("demo/example/**");
        let found = findings(
            &holders(&acl),
            "demo/example/temperature",
            "declare_subscriber",
        );

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].permission, AclPermission::Deny);
        assert_eq!(found[0].rule_id, "deny pub/sub");
        assert_eq!(found[0].node_name.as_deref(), Some("router-1"));
    }

    #[test]
    fn reports_how_the_rule_relates_to_the_query() {
        let acl = deny_subscribe_on("demo/example/**");
        let found = findings(&holders(&acl), "demo/example/**", "declare_subscriber");
        assert_eq!(found[0].relation, Some(Relation::Equals));
    }

    #[test]
    fn ignores_a_different_message_kind() {
        let acl = deny_subscribe_on("demo/example/**");
        assert!(findings(&holders(&acl), "demo/example/x", "query").is_empty());
    }

    #[test]
    fn ignores_a_disjoint_key() {
        let acl = deny_subscribe_on("demo/example/**");
        assert!(findings(&holders(&acl), "fleet/agv/07", "declare_subscriber").is_empty());
    }

    #[test]
    fn ignores_the_whole_policy_when_acl_is_disabled() {
        let mut acl = deny_subscribe_on("demo/example/**");
        acl.enabled = false;
        assert!(findings(&holders(&acl), "demo/example/x", "declare_subscriber").is_empty());
    }

    #[test]
    fn ignores_a_rule_no_policy_binds() {
        // Configured and inert: reporting it sends someone hunting a filter
        // that is not filtering.
        let mut acl = deny_subscribe_on("demo/example/**");
        acl.policies.clear();
        assert!(findings(&holders(&acl), "demo/example/x", "declare_subscriber").is_empty());
    }

    #[test]
    fn an_empty_flow_list_means_both_directions() {
        let mut acl = deny_subscribe_on("demo/example/**");
        acl.rules[0].flows.clear();
        let found = findings(&holders(&acl), "demo/example/x", "declare_subscriber");
        assert_eq!(found[0].flows, vec![AclFlow::Ingress, AclFlow::Egress]);
    }

    #[test]
    fn denies_sort_before_allows() {
        let mut acl = deny_subscribe_on("demo/**");
        acl.rules.push(AclRule {
            id: "allow all".to_owned(),
            permission: AclPermission::Allow,
            flows: Vec::new(),
            messages: vec!["declare_subscriber".to_owned()],
            key_exprs: vec!["demo/**".to_owned()],
        });
        acl.policies[0].rules.push("allow all".to_owned());

        let found = findings(&holders(&acl), "demo/x", "declare_subscriber");
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].permission, AclPermission::Deny);
    }

    #[test]
    fn active_rules_are_only_those_a_policy_names() {
        let mut acl = deny_subscribe_on("demo/**");
        acl.rules.push(AclRule {
            id: "unused".to_owned(),
            permission: AclPermission::Deny,
            flows: Vec::new(),
            messages: vec!["put".to_owned()],
            key_exprs: vec!["**".to_owned()],
        });

        let active = acl.active_rules();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, "deny pub/sub");
    }
}
