"""Small new wrapper around reviewed SQL. Preserve its ten-row CAS/receipts.
Fence empty MFA/webhook families in the same transaction before key replacement.
"""
def guard_empty_families(sql):
    anchor='CREATE TEMP TABLE cipher_review_input'
    if sql.count(anchor)!=1 or not sql.startswith('BEGIN;'):raise RuntimeError('reviewed_sql_shape_drift')
    gate='LOCK TABLE "MfaTotpSecret","WebhookEndpoint" IN SHARE ROW EXCLUSIVE MODE;\nDO $empty$ BEGIN IF EXISTS(SELECT 1 FROM "MfaTotpSecret")OR EXISTS(SELECT 1 FROM "WebhookEndpoint")THEN RAISE EXCEPTION \'empty_cipher_family_drift\';END IF;END $empty$;\n'
    return sql.replace(anchor,gate+anchor,1)
