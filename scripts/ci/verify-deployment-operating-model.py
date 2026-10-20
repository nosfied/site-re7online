#!/usr/bin/env python3
"""Validate the canonical immutable release lane and historical boundaries."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def require(value,reason):
    if not value: raise SystemExit(f"DEPLOYMENT_OPERATING_MODEL_INVALID: {reason}")
model=(ROOT/'docs/saas/DEPLOYMENT_OPERATING_MODEL.md').read_text()
for marker in ('IMMUTABLE_RELEASE','BREAK_GLASS','produção viva','Node `20.20.0`','AWAITING_ACCEPTANCE','ROLLBACK_FAILED'):
    require(marker in model,f'marker {marker}')
require('REPROVADO / HISTÓRICO / NÃO UTILIZÁVEL' in model,'retired normal executor')
manifest=json.loads((ROOT/'docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_NORMAL_RELEASE.json').read_text())
require(manifest['deploymentClass']=='IMMUTABLE_RELEASE','release class')
require(manifest['executor']=='scripts/deploy-immutable-release.py','executor')
require(manifest['components']==['api','frontend'],'component order')
require(manifest['changeBoundary']['workerChanged'] is False,'worker boundary')
require(manifest['promotionAuthorized'] is False,'manifest cannot self-authorize')
source=(ROOT/manifest['executor']).read_text()
for marker in ('prepare','probe-frontend','promote','commit','rollback','NO_PROVEN_SIDE_EFFECT_FREE_MODE','owns_listening_socket'):
    require(marker in source,f'executor {marker}')
print('DEPLOYMENT_OPERATING_MODEL_OK: immutable external build and component selection are canonical')
