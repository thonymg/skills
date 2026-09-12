#!/usr/bin/env python3
"""Static checks over skills/. Every check here caught a real bug at least once.

  1. frontmatter   — parses as YAML, exactly name+description, name == folder.
                     A wrapped description line starting "Word: " silently
                     becomes a YAML key; the skill then loads with no
                     description and never triggers.
  2. description   — length budget. It is loaded into EVERY session, not just
                     when the skill runs, so it is the most expensive text
                     in the repo per byte.
  3. links         — local links resolve, and no references/*.md is orphaned.
                     An unreferenced reference is bytes nothing ever loads.
  4. script paths  — no `skills/<name>/scripts/...` literal. That path is only
                     correct inside this repo; installed the skill lives at
                     .claude/skills/<name>/ or ~/.agents/skills/<name>/.
  5. MCP names     — a skill naming codebase-memory tools must document both
                     harness prefixes in SKILL.md, plus pi lazy activation.

Usage: tests/check-skills.py [--max-description N]
Exit: 0 clean, 1 violations.
"""
import argparse
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS = os.path.join(ROOT, "skills")

TOOLS = ("search_graph|trace_path|detect_changes|index_status|get_code_snippet|"
         "query_graph|get_architecture|list_projects|index_repository|manage_adr|"
         "check_index_coverage|get_graph_schema|search_code|ingest_traces|delete_project")
LAZY = "trace_path|query_graph|detect_changes|get_architecture|get_graph_schema"


def md_files(skill_dir):
    for base, _, names in os.walk(skill_dir):
        for n in names:
            if n.endswith(".md"):
                yield os.path.join(base, n)


def check(skill, skill_dir, max_description):
    problems = []
    skill_md = os.path.join(skill_dir, "SKILL.md")
    src = open(skill_md).read()

    match = re.match(r"---\n(.*?)\n---\n", src, re.S)
    if not match:
        return [f"{skill}: no YAML frontmatter"]
    try:
        front = yaml.safe_load(match.group(1))
    except yaml.YAMLError as exc:
        return [f"{skill}: frontmatter is not valid YAML ({exc.__class__.__name__})"]

    extra = set(front) - {"name", "description"}
    if extra:
        problems.append(
            f"{skill}: unexpected frontmatter keys {sorted(extra)} — a wrapped "
            f"description line starting 'Word: ' parses as a key")
    if front.get("name") != skill:
        problems.append(f"{skill}: frontmatter name is {front.get('name')!r}, folder is {skill!r}")

    description = front.get("description") or ""
    if len(description) > max_description:
        problems.append(
            f"{skill}: description is {len(description)} chars, budget {max_description} "
            f"— it loads in every session")

    body = src[match.end():]
    for target in set(re.findall(r"\]\((?!https?:)([^)#]+)\)", body)):
        if not os.path.exists(os.path.join(skill_dir, target)):
            problems.append(f"{skill}: broken link {target}")

    references = os.path.join(skill_dir, "references")
    if os.path.isdir(references):
        # Both spellings count as a pointer: a markdown link, and a bare
        # `references/x.md` in backticks — several skills use a load table
        # rather than inline links.
        mentioned = "\n".join(open(p).read() for p in md_files(skill_dir))
        for name in sorted(os.listdir(references)):
            if name.endswith(".md") and f"references/{name}" not in mentioned:
                problems.append(f"{skill}: references/{name} is orphaned — nothing ever loads it")

    # Any repo-relative path into the skill's own folder, not just scripts/:
    # linter/, templates/ and languages/ break the same way once installed.
    for path in md_files(skill_dir):
        # `.claude/skills/<name>/` and `~/.agents/skills/<name>/` are the
        # install locations a skill legitimately names; only a bare
        # repo-relative `skills/<name>/...` is the bug.
        hit = re.search(rf"(?<!\.claude/)(?<!\.agents/)\bskills/{re.escape(skill)}/\S+",
                        open(path).read())
        if hit:
            rel = os.path.relpath(path, ROOT)
            problems.append(
                f"{skill}: {rel} hardcodes {hit.group(0)!r} — only correct inside this repo, use <skill-dir>/")

    bodies = {p: open(p).read() for p in md_files(skill_dir)}
    if any(re.search(rf"`({TOOLS})\b", t) for t in bodies.values()):
        if "mcp__codebase-memory-mcp__" not in src or "cbm_" not in src:
            problems.append(f"{skill}: names MCP tools, SKILL.md missing a harness prefix note")
        elif (any(re.search(rf"`({LAZY})\b", t) for t in bodies.values())
              and "cbm_search_tools" not in src):
            problems.append(f"{skill}: uses a lazy tool, SKILL.md missing the cbm_search_tools note")
    return problems


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-description", type=int, default=1200)
    args = parser.parse_args()

    problems = []
    for skill in sorted(os.listdir(SKILLS)):
        skill_dir = os.path.join(SKILLS, skill)
        if os.path.isfile(os.path.join(skill_dir, "SKILL.md")):
            problems += check(skill, skill_dir, args.max_description)

    for problem in problems:
        print(problem)
    if problems:
        print(f"\n{len(problems)} problem(s)")
        return 1
    print("skills: frontmatter, budgets, links, script paths and MCP prefixes all clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
