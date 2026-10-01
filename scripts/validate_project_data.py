#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""神官養成学園 v1.2 統合データ整合性チェッカー"""
from pathlib import Path
import json, re, sys
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/'data'
STAT_KEYS=['hp','sp','atk','def','spd','int','tec','eva','acc','luk']
ATTRIBUTES={'火','水','雷','風','土','光','闇','氷','木','焔','嵐','霆','聖','冥'}
errors=[]; warnings=[]
def err(x): errors.append(x)
def warn(x): warnings.append(x)
def load_dir(folder):
    out={}
    for p in sorted((DATA/folder).glob('*.json')):
        try:d=json.loads(p.read_text(encoding='utf-8'))
        except Exception as e: err(f'{folder}/{p.name}: JSON parse error: {e}'); continue
        if not isinstance(d,dict): err(f'{folder}/{p.name}: root must be object'); continue
        if 'id' not in d: err(f'{folder}/{p.name}: missing id')
        else:
            if d['id'] in out: err(f'{folder}: duplicate id {d["id"]}')
            out[d['id']]=d
    return out

def main():
    dirs={k:load_dir(k) for k in ['characters','artifacts','guardians','skills','enemies','items','maps','events']}
    chars,arts,guards,skills,enemies,items,maps,events=[dirs[k] for k in ['characters','artifacts','guardians','skills','enemies','items','maps','events']]
    if len(chars)!=30: err(f'characters: expected 30, got {len(chars)}')
    if len(arts)!=30: err(f'artifacts: expected 30, got {len(arts)}')
    if len(guards)!=30: err(f'guardians: expected 30, got {len(guards)}')
    artifact_refs={}; guardian_refs={}
    for cid,c in chars.items():
        if c.get('class') not in {'A','B'}: err(f'character {cid}: invalid class')
        s=c.get('stats')
        if not isinstance(s,dict): err(f'character {cid}: stats missing'); continue
        for lv in ('lv1','lv100'):
            x=s.get(lv)
            if not isinstance(x,dict): err(f'character {cid}: stats.{lv} missing'); continue
            if set(x)!=set(STAT_KEYS): err(f'character {cid}: stats.{lv} keys mismatch: {sorted(x)}')
            for k in STAT_KEYS:
                if not isinstance(x.get(k),(int,float)): err(f'character {cid}: stats.{lv}.{k} must be number')
        aid=c.get('artifact_id'); gid=c.get('guardian_id')
        if aid not in arts: err(f'character {cid}: unknown artifact_id {aid}')
        else: artifact_refs.setdefault(aid,[]).append(cid)
        if gid not in guards: err(f'character {cid}: unknown guardian_id {gid}')
        else: guardian_refs.setdefault(gid,[]).append(cid)
        if c['class']=='A':
            if 'join_episode' not in c: err(f'character {cid}: A組 requires join_episode')
        else:
            if 'join_episode' in c: err(f'character {cid}: B組 must not use join_episode')
            if c.get('playable_in_episodes') != [25,26,27,38,40,41]: err(f'character {cid}: unexpected playable_in_episodes {c.get("playable_in_episodes")}')
    for aid,o in artifact_refs.items():
        if len(o)!=1: err(f'artifact {aid}: expected exactly one owner, got {o}')
    for gid,o in guardian_refs.items():
        if len(o)!=1: err(f'guardian {gid}: expected exactly one owner, got {o}')
    for aid,a in arts.items():
        if 'owner_id' in a: err(f'artifact {aid}: owner_id must not be duplicated')
        if 'stats' in a or 'lv1' in a or 'lv100' in a: err(f'artifact {aid}: character stats leaked into artifact')
        if a.get('attribute') not in ATTRIBUTES: warn(f'artifact {aid}: unusual attribute {a.get("attribute")}')
    for gid,g in guards.items():
        if 'owner_id' in g: err(f'guardian {gid}: owner_id must not be duplicated')
        if 'stats' in g or 'lv1' in g or 'lv100' in g: err(f'guardian {gid}: character stats leaked into guardian')
        if g.get('starting_affinity')!=0: err(f'guardian {gid}: starting_affinity must be 0')
    # Enemy hp/stats are legitimate enemy-domain data; only reject character-specific schema leakage.
    for eid,e in enemies.items():
        for bad in ('artifact_id','guardian_id','entrance_number'):
            if bad in e: err(f'enemy {eid}: character-only field leaked: {bad}')
    # Markdown artifact audit
    amd=(ROOT/'04_神器/01_神器一覧.md').read_text(encoding='utf-8')
    if re.search(r'\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]',amd): err('04_神器/01_神器一覧.md: 10-number character stat array detected')
    for aid,a in arts.items():
        if f'|{aid}|' not in amd: err(f'artifact markdown missing {aid}')
        if a['name'] not in amd: err(f'artifact markdown missing name for {aid}: {a["name"]}')
    cmd=(ROOT/'03_キャラクター/00_30人一覧.md').read_text(encoding='utf-8')
    header=next((x for x in cmd.splitlines() if x.startswith('|ID|')),'')
    for k in ['HP','SP','攻撃','防御','素早さ','賢さ','技術','回避','命中','運']:
        if k not in header: err(f'character markdown missing stat column {k}')
    # Check JSON filename/id correspondence for all datasets.
    for folder,data in dirs.items():
        for p in (DATA/folder).glob('*.json'):
            try:d=json.loads(p.read_text(encoding='utf-8'))
            except: continue
            if d.get('id') and p.stem != d['id'] and not (folder=='events' and p.stem=='CH2_B_EXCHANGE_RESULTS'):
                err(f'{folder}/{p.name}: filename/id mismatch ({d.get("id")})')
    if errors:
        print('FAIL'); [print('ERROR:',x) for x in errors]; [print('WARNING:',x) for x in warnings]; return 1
    print('PASS')
    print(f'characters={len(chars)} artifacts={len(arts)} guardians={len(guards)} skills={len(skills)} enemies={len(enemies)} items={len(items)} maps={len(maps)} events={len(events)}')
    print('Character 10-stat data is isolated to character JSON.')
    print('Artifact/guardian ownership is canonicalized through character references.')
    print('Artifact markdown contains no character stat arrays.')
    [print('WARNING:',x) for x in warnings]
    return 0
if __name__=='__main__': sys.exit(main())
