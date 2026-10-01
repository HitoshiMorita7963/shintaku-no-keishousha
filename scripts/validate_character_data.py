import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHARS = ROOT / "data" / "characters"
ARTS = ROOT / "data" / "artifacts"
GUAS = ROOT / "data" / "guardians"
STAT_KEYS = ["hp", "sp", "atk", "def", "spd", "int", "tec", "eva", "acc", "luk"]

errors = []
chars = sorted(CHARS.glob("*.json"))
if len(chars) != 30:
    errors.append(f"characters: expected 30 files, got {len(chars)}")

for p in chars:
    try:
        c = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        errors.append(f"{p.name}: invalid JSON: {e}")
        continue
    cid = c.get("id")
    if cid != p.stem:
        errors.append(f"{p.name}: id mismatch: {cid}")
    for lv in ("lv1", "lv100"):
        s = c.get("stats", {}).get(lv, {})
        missing = [k for k in STAT_KEYS if k not in s]
        extra = [k for k in s if k not in STAT_KEYS]
        if missing or extra:
            errors.append(f"{cid}: {lv}: missing={missing}, extra={extra}")
    aid = c.get("artifact_id")
    gid = c.get("guardian_id")
    ap = ARTS / f"{aid}.json" if aid else None
    gp = GUAS / f"{gid}.json" if gid else None
    if not ap or not ap.exists(): errors.append(f"{cid}: missing artifact reference {aid}")
    if not gp or not gp.exists(): errors.append(f"{cid}: missing guardian reference {gid}")

if errors:
    print("FAILED")
    print("\n".join(f"- {e}" for e in errors))
    raise SystemExit(1)
print("OK: 30 character JSON files and all 10-stat fields/references are consistent.")
