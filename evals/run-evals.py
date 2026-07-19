#!/usr/bin/env python3
"""Runner d'évals de déclenchement/conformité pour les skills du repo.

Chaque cas de evals/<skill>.json est joué via `claude -p` dans un workspace
temporaire où le skill est installé comme project skill (.claude/skills/<name>).

  - should_trigger    : le skill doit (ou non) être invoqué pendant la session
  - expected_checks[] : regex devant matcher la réponse finale
  - forbidden_patterns[] : regex ne devant PAS matcher

Usage :
  evals/run-evals.py naming-convention                 # 1 trial par cas
  evals/run-evals.py naming-convention --trials 3      # 3 trials (recommandé)
  evals/run-evals.py naming-convention --without-skill # test de retraite (baseline sans skill)
  evals/run-evals.py archi-vide --cases nominal-go-repository
  evals/run-evals.py naming-convention --dry-run       # liste les cas sans appeler claude

Coût : chaque trial = un appel API. 19 cas × 3 trials ≈ 57 sessions.
Résultats écrits dans evals/results/.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def detect_trigger(events, skill):
    """Le skill est considéré déclenché si l'assistant invoque le tool Skill
    avec son nom, ou lit un fichier du skill (skills/<name>/…)."""
    for event in events:
        message = event.get("message") or {}
        content = message.get("content") or []
        if not isinstance(content, list):
            continue
        for block in content:
            if not (isinstance(block, dict) and block.get("type") == "tool_use"):
                continue
            payload = json.dumps(block.get("input") or {})
            if block.get("name") == "Skill" and skill in payload:
                return True
            if f"skills/{skill}/" in payload or f"{skill}/SKILL.md" in payload:
                return True
    return False


def run_case(case, skill, with_skill, model, timeout):
    workspace = tempfile.mkdtemp(prefix="skill-eval-")
    try:
        if with_skill:
            destination = os.path.join(workspace, ".claude", "skills", skill)
            shutil.copytree(os.path.join(REPO, "skills", skill), destination)

        cmd = [
            "claude", "-p", case["prompt"],
            "--output-format", "stream-json", "--verbose",
            "--max-turns", "8",
            "--allowedTools", "Skill,Read,Glob,Grep",
        ]
        if model:
            cmd += ["--model", model]

        proc = subprocess.run(cmd, cwd=workspace, capture_output=True, text=True, timeout=timeout)
        events = []
        for line in proc.stdout.splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

        triggered = detect_trigger(events, skill)
        final_text = next(
            (e.get("result", "") for e in reversed(events) if e.get("type") == "result"),
            "",
        )
    except subprocess.TimeoutExpired:
        return {"passed": False, "reason": "timeout", "triggered": None}
    finally:
        shutil.rmtree(workspace, ignore_errors=True)

    reasons = []
    if triggered != case["should_trigger"]:
        reasons.append(f"trigger={triggered} attendu={case['should_trigger']}")
    for pattern in case.get("expected_checks", []):
        if not re.search(pattern, final_text):
            reasons.append(f"attendu absent: /{pattern}/")
    for pattern in case.get("forbidden_patterns", []):
        if re.search(pattern, final_text):
            reasons.append(f"interdit présent: /{pattern}/")

    return {"passed": not reasons, "reason": "; ".join(reasons), "triggered": triggered}


def run(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("skill", help="nom du skill (fichier evals/<skill>.json)")
    parser.add_argument("--trials", type=int, default=1)
    parser.add_argument("--without-skill", action="store_true", help="test de retraite : sans le skill installé")
    parser.add_argument("--cases", help="ids de cas séparés par des virgules")
    parser.add_argument("--model", default=None)
    parser.add_argument("--timeout", type=int, default=300, help="timeout par trial (s)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    spec_path = os.path.join(REPO, "evals", f"{args.skill}.json")
    with open(spec_path) as handle:
        spec = json.load(handle)

    cases = spec["cases"]
    if args.cases:
        wanted = set(args.cases.split(","))
        cases = [c for c in cases if c["id"] in wanted]

    if args.dry_run:
        for case in cases:
            print(f"{case['id']:32} trigger={case['should_trigger']}  {case['prompt'][:70]}")
        return 0

    if not shutil.which("claude"):
        print("erreur : CLI `claude` introuvable dans le PATH", file=sys.stderr)
        return 2

    with_skill = not args.without_skill
    mode = "with-skill" if with_skill else "without-skill"
    print(f"skill={args.skill}  mode={mode}  trials={args.trials}  cas={len(cases)}\n")

    results = []
    total_pass = 0
    total_trials = 0
    for case in cases:
        trial_results = [
            run_case(case, args.skill, with_skill, args.model, args.timeout)
            for _ in range(args.trials)
        ]
        passed = sum(1 for r in trial_results if r["passed"])
        total_pass += passed
        total_trials += args.trials
        status = "✅" if passed == args.trials else ("❌" if passed == 0 else "⚠️")
        print(f"{status} {case['id']:32} {passed}/{args.trials}")
        for trial in trial_results:
            if not trial["passed"]:
                print(f"     ↳ {trial['reason']}")
        results.append({"id": case["id"], "passed": passed, "trials": args.trials,
                        "details": trial_results})

    rate = 100.0 * total_pass / total_trials if total_trials else 0.0
    print(f"\nScore : {total_pass}/{total_trials} trials ({rate:.0f}%)")

    out_dir = os.path.join(REPO, "evals", "results")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{args.skill}-{mode}.json")
    with open(out_path, "w") as handle:
        json.dump({"skill": args.skill, "mode": mode, "score_percent": rate,
                   "results": results}, handle, indent=2)
    print(f"Résultats → {os.path.relpath(out_path, REPO)}")

    return 0 if total_pass == total_trials else 1


if __name__ == "__main__":
    sys.exit(run())
