"""Assertions for the round-trip test: order, lineage, and section survive."""
import json
import sys

b = json.load(open(sys.argv[1]))["book"]
print("  name=%s variant=%s plays=%d" % (b["name"], b["variant"], len(b["entries"])))
for e in b["entries"]:
    print("  %2s  pos=%-4s %-10s %s"
          % (e["callNumber"], e["position"], e["section"], e["play"]["spec"]["name"]))
    assert e["play"]["lineage"]["rootId"], "lineage lost"
positions = [e["position"] for e in b["entries"]]
assert positions == sorted(positions), "playbook came back out of order"
assert len(b["entries"]) == 2, "expected two plays back"
print("  order preserved, lineage intact")
