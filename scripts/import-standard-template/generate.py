#!/usr/bin/env python3
"""
Generate deterministic SQL to import the "Standard Church Plant" template into
public.tasks (+ task_resources) from source.xlsx.

Dev tooling (not app code) — the repo's TypeScript-only rule governs src/.

Output: standard-template.seed.sql, inserted level-by-level (root -> phases ->
milestones -> tasks -> subtasks) so every parent row exists before its children
(the set_root_id_from_parent trigger reads the parent row).

UUIDs are stable across runs: uuid5(NS, "...:<excel_id>"), so re-running is
idempotent-friendly and reviewable in diffs.

Mapping (Excel -> public.tasks):
  id                         -> stable uuid5 (see NS)
  parent_task_id (0 => root) -> mapped uuid (roots re-parent to the template root)
  title/purpose/description/actions -> copy
  days_from_start_until_due  -> days_from_start (normalized to 0-based; see below)
  default_duration           -> duration (NOT NULL -> 0)
  admin_notes                -> notes
  position (global 1..432)   -> recomputed rank within sibling group (0-based)
Triggers auto-set root_id, task_type, is_complete, updated_at -> NOT provided.
"""
import re
import uuid
import openpyxl
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "source.xlsx"
OUT = HERE / "standard-template.seed.sql"
SHEET = "tasks in launch large"

# Stable namespace for this import (fixed => deterministic UUIDs).
NS = uuid.UUID("6f9b1e2a-0c3d-5e4f-8a1b-000000000001")
ROOT_ID = uuid.uuid5(NS, "standard-church-plant:root")
TEMPLATE_TITLE = "Standard Church Plant"
# Creator resolved at run-time from auth.users (avoids hardcoding a uuid).
CREATOR_SQL = "(SELECT id FROM auth.users WHERE email = 'timothy.cheung58@gmail.com')"

def tid(excel_id) -> uuid.UUID:
    return uuid.uuid5(NS, f"standard-church-plant:task:{norm_id(excel_id)}")

def rid(excel_id, idx) -> uuid.UUID:
    return uuid.uuid5(NS, f"standard-church-plant:res:{norm_id(excel_id)}:{idx}")

def norm_id(v) -> str:
    # Excel numbers arrive as floats (1.0). Normalize to int-string.
    if v is None:
        return ""
    if isinstance(v, float):
        return str(int(v))
    return str(v).strip()

def sql_str(v) -> str:
    if v is None:
        return "NULL"
    s = str(v)
    return "'" + s.replace("'", "''") + "'"

def sql_int(v, default=None) -> str:
    if v is None or v == "":
        return "NULL" if default is None else str(default)
    try:
        return str(int(round(float(v))))
    except (TypeError, ValueError):
        return "NULL" if default is None else str(default)

# ---- Read -------------------------------------------------------------------
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb[SHEET]
rows = list(ws.iter_rows(values_only=True))
hdr = [str(h).strip() if h else h for h in rows[0]]
ix = {h: i for i, h in enumerate(hdr) if h}

def col(r, name):
    i = ix.get(name)
    return r[i] if i is not None and i < len(r) else None

records = []
for r in rows[1:]:
    if not any(x is not None for x in r):
        continue
    records.append({
        "eid": norm_id(col(r, "id")),
        "eparent": norm_id(col(r, "parent_task_id")),
        "epos": col(r, "position"),
        "title": col(r, "title"),
        "purpose": col(r, "purpose"),
        "description": col(r, "description"),
        "actions": col(r, "actions"),
        "resources": col(r, "additional_resources"),
        "days": col(r, "days_from_start_until_due"),
        "duration": col(r, "default_duration"),
        "notes": col(r, "admin_notes"),
    })

by_eid = {rec["eid"]: rec for rec in records}

# Depth: excel roots (parent 0/'') sit at level 1 (phase) under our new root.
def is_excel_root(rec):
    return rec["eparent"] in ("", "0")

def depth(rec, guard=0):
    if is_excel_root(rec):
        return 1
    p = by_eid.get(rec["eparent"])
    if p is None or guard > 20:
        return 1
    return depth(p, guard + 1) + 1

for rec in records:
    rec["depth"] = depth(rec)

# Normalize day offsets to 0-based. The source column is 1-based (the earliest
# actionable task is "day 1"), but the date engine treats days_from_start as a
# 0-based offset from the project start (leaf start = anchor::date +
# days_from_start). Left as-is, every cloned project would start one day AFTER
# the start date the user picks. Subtract the smallest leaf offset so the
# earliest task anchors exactly to the chosen start date; spacing is preserved.
def _days_int(rec):
    v = rec["days"]
    if v is None or v == "":
        return 0
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return 0

_parent_eids = {rec["eparent"] for rec in records if rec["eparent"] not in ("", "0")}
_leaf_offsets = [_days_int(rec) for rec in records if rec["eid"] not in _parent_eids]
_min_leaf_offset = min(_leaf_offsets) if _leaf_offsets else 0
for rec in records:
    rec["days"] = max(_days_int(rec) - _min_leaf_offset, 0)

# Position: rank within sibling group, ordered by original global position.
groups = {}
for rec in records:
    key = "ROOT" if is_excel_root(rec) else rec["eparent"]
    groups.setdefault(key, []).append(rec)
for key, sibs in groups.items():
    sibs.sort(key=lambda x: (float(x["epos"]) if x["epos"] is not None else 1e9))
    for pos, rec in enumerate(sibs):
        rec["position"] = pos

def parent_uuid(rec) -> uuid.UUID:
    return ROOT_ID if is_excel_root(rec) else tid(rec["eparent"])

# ---- Resource parsing -------------------------------------------------------
ANCHOR = re.compile(r'<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)</a>', re.I | re.S)

def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()

def parse_resources(cell):
    """Return list of (resource_type, url_or_none, text_or_none, name)."""
    if not cell:
        return []
    cell = str(cell)
    out = []
    anchors = ANCHOR.findall(cell)
    has_internal = False
    for href, label in anchors:
        href = href.strip()
        name = strip_tags(label) or href
        if href.lower().startswith(("http://", "https://")):
            out.append(("url", href, None, name[:200]))
        else:
            # Internal /resources/item/N or other relative link -> unresolved legacy.
            has_internal = True
    # Leftover free text (outside anchors), e.g. "by Carey Nieuwhof ...".
    leftover = strip_tags(ANCHOR.sub("", cell)).strip()
    if has_internal or leftover:
        raw = strip_tags(cell).strip()
        if raw:
            out.append(("text", None, raw[:4000], "Legacy resources (needs curation)"))
    return out

# ---- Emit -------------------------------------------------------------------
COLS = ("id, parent_task_id, creator, origin, title, purpose, description, "
        "actions, notes, position, status, days_from_start, duration, settings")

def task_values(id_uuid, parent_sql, rec, settings_sql):
    return (
        f"('{id_uuid}', {parent_sql}, {CREATOR_SQL}, 'template', "
        f"{sql_str(rec['title'])}, {sql_str(rec['purpose'])}, {sql_str(rec['description'])}, "
        f"{sql_str(rec['actions'])}, {sql_str(rec['notes'])}, {rec['position']}, 'todo', "
        f"{sql_int(rec['days'], 0)}, {sql_int(rec['duration'], 0)}, {settings_sql})"
    )

lines = []
lines.append("-- GENERATED by scripts/import-standard-template/generate.py — do not edit by hand.")
lines.append("-- Imports the 'Standard Church Plant' template (1 root + 432 tasks + resources).")
lines.append("BEGIN;")
lines.append("")

# Root
root_rec = {"title": TEMPLATE_TITLE, "purpose": None, "description":
            "Canonical church-planting template.", "actions": None, "notes": None,
            "position": 0, "days": 0, "duration": 0}
lines.append(f"-- Root (task_type auto-derives to 'project'):")
lines.append(f"INSERT INTO public.tasks ({COLS}) VALUES")
lines.append("  " + task_values(ROOT_ID, "NULL", root_rec,
             "'{\"published\": true, \"project_kind\": \"date\"}'::jsonb") + ";")
lines.append("")

# Levels 1..4
level_names = {1: "phases", 2: "milestones", 3: "tasks", 4: "subtasks"}
for lvl in (1, 2, 3, 4):
    recs = [r for r in records if r["depth"] == lvl]
    recs.sort(key=lambda x: (str(parent_uuid(x)), x["position"]))
    lines.append(f"-- Level {lvl} — {level_names[lvl]} ({len(recs)} rows):")
    lines.append(f"INSERT INTO public.tasks ({COLS}) VALUES")
    vals = [task_values(tid(r["eid"]), f"'{parent_uuid(r)}'", r, "'{}'::jsonb") for r in recs]
    lines.append(",\n".join("  " + v for v in vals) + ";")
    lines.append("")

# Resources
res_lines = []
primary_updates = []
res_count = 0
for rec in records:
    parsed = parse_resources(rec["resources"])
    if not parsed:
        continue
    task_uuid = tid(rec["eid"])
    first_rid = None
    for idx, (rtype, url, text, name) in enumerate(parsed):
        r_uuid = rid(rec["eid"], idx)
        if first_rid is None:
            first_rid = r_uuid
        res_lines.append(
            f"  ('{r_uuid}', '{task_uuid}', '{rtype}', "
            f"{sql_str(url)}, {sql_str(text)}, {sql_str(name)})"
        )
        res_count += 1
    primary_updates.append(f"UPDATE public.tasks SET primary_resource_id = '{first_rid}' WHERE id = '{task_uuid}';")

lines.append(f"-- task_resources ({res_count} rows across {len(primary_updates)} tasks):")
lines.append("INSERT INTO public.task_resources (id, task_id, resource_type, resource_url, resource_text, name) VALUES")
lines.append(",\n".join(res_lines) + ";")
lines.append("")
lines.append("-- Primary resource per task (first parsed resource):")
lines.extend(primary_updates)
lines.append("")
lines.append("COMMIT;")

OUT.write_text("\n".join(lines) + "\n")

# ---- Report -----------------------------------------------------------------
from collections import Counter
dc = Counter(r["depth"] for r in records)
print(f"Wrote {OUT}")
print(f"  task rows: {len(records)} (+1 root)  depth histogram: {dict(sorted(dc.items()))}")
print(f"  task_resources: {res_count} across {len(primary_updates)} tasks")
print(f"  root uuid: {ROOT_ID}")
