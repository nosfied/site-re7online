"""Budget only: capacity PASS also requires current WAL/activity/custody checks."""
import json
import sys

def budget(required, deploy, postgres, reclaim=0):
    for name, value in [('required',required),('deploy',deploy),('postgres',postgres),('reclaim',reclaim)]:
        if type(value) is not int or value < 0:
            raise ValueError(name + '_invalid')
    minimum = min(deploy, postgres)
    return {'minimumAvailableBytes':minimum,'shortfallBytes':max(required-minimum,0),
            'projectedAvailableBytes':minimum+reclaim,'projectedMarginBytes':minimum+reclaim-required,
            'budgetFitsNow':minimum>=required,'capacityCertified':False}

if __name__ == '__main__':
    with open(sys.argv[1]) as f: v=json.load(f)
    print(json.dumps(budget(v['requiredFreeBytes'],v['availableDeployBytes'],v['availablePostgresBytes'],v['proposedReclaimBytes'])))
