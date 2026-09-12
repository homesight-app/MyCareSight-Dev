#!/usr/bin/env python3
"""
Convert a JSON array (Supabase MCP result) to PostgreSQL INSERT statements.
Usage: python json-to-inserts.py <table_name> <input.json> [output.sql]
Or pipe: echo '[...]' | python json-to-inserts.py <table_name>
"""
import sys, json, re

def escape_str(s):
    return s.replace("\\", "\\\\").replace("'", "''")

def pg_literal(val, col_name=""):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, list):
        if not val:
            if "uuid" in col_name.lower() or col_name.endswith("_ids"):
                return "'{}'::uuid[]"
            return "'{}'::text[]"
        parts = []
        for item in val:
            if item is None:
                parts.append("NULL")
            elif isinstance(item, str):
                parts.append('"' + item.replace('"', '\\"') + '"')
            else:
                parts.append(str(item))
        return "'{" + ",".join(parts) + "}'"
    if isinstance(val, dict):
        return "'" + escape_str(json.dumps(val)) + "'::jsonb"
    # string
    s = str(val)
    return "'" + escape_str(s) + "'"

def rows_to_inserts(table, rows):
    if not rows:
        return []
    stmts = []
    for row in rows:
        cols = list(row.keys())
        vals = [pg_literal(row[c], c) for c in cols]
        col_list = ", ".join(f'"{c}"' for c in cols)
        val_list = ", ".join(vals)
        stmts.append(f"INSERT INTO {table} ({col_list}) VALUES ({val_list}) ON CONFLICT DO NOTHING")
    return stmts

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python json-to-inserts.py <table_name> [input_file]", file=sys.stderr)
        sys.exit(1)
    table = sys.argv[1]
    if len(sys.argv) >= 3:
        with open(sys.argv[2], encoding="utf-8") as f:
            content = f.read()
    else:
        content = sys.stdin.read()
    
    # Handle Supabase MCP wrapper format
    import re as _re
    m = _re.search(r'\[untrusted-data\](.*?)\[/untrusted-data\]', content, _re.DOTALL)
    if m:
        content = m.group(1).strip()
    
    # Try to parse as JSON
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}", file=sys.stderr)
        sys.exit(1)
    
    stmts = rows_to_inserts(table, data)
    print(f"-- Table: {table} — {len(data)} rows", file=sys.stderr)
    for s in stmts:
        print(s)
