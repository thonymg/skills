#!/usr/bin/env python3
"""Runner d'évals de déclenchement/conformité pour les skills du repo.

Chaque cas de evals/<skill>.json est joué via `claude -p` dans un workspace
temporaire où le skill est installé comme project skill (.claude/skills/<name>).

  - should_trigger    : le skill doit (ou non) être invoqué pendant la session
  - expected_checks[] : regex devant matcher la réponse finale
  - forbidden_patterns[] : regex ne devant PAS matcher
  - fixture           : nom d'un dossier evals/fixtures/<nom> copié dans le
                        workspace et commité en git. Sans fixture le workspace
                        est VIDE : le cas ne teste alors que le déclenchement
                        et la formulation, jamais un fix réel.
  - max_tool_calls    : budget d'appels d'outils ; dépassé = cas échoué.
                        C'est ce qui rend le coût falsifiable au lieu de subi.

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
    """Déclenché = tool Skill invoqué avec son nom, ou SKILL.md lu.

    Lire le SKILL.md, c'est charger le skill. Traverser le dossier des
    skills avec un Glob/Grep, non : le skill est installé sous
    .claude/skills/<name>/, donc un `skills/<name>/` naïf matchait toute
    exploration et faisait échouer les cas négatifs pour avoir regardé.
    """
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
            # Targeting the skill's own files is intent to load it, whichever
            # tool does it (Read, Grep on a section, a reference page). A bare
            # `skills/<name>/` match would also fire on any traversal of the
            # skills directory, which is why the path has to be this precise.
            if f"{skill}/SKILL.md" in payload or f"{skill}/references/" in payload:
                return True
    return False


def collect_metrics(events):
    """Appels d'outils effectués, plus coût/tours depuis l'événement result."""
    names = [
        block.get("name")
        for event in events
        for block in (event.get("message") or {}).get("content") or []
        if isinstance(block, dict) and block.get("type") == "tool_use"
    ]
    result = next((e for e in reversed(events) if e.get("type") == "result"), {})
    usage = result.get("usage") or {}
    return {
        "tool_calls": len(names),
        "tools_used": sorted({n for n in names if n}),
        "num_turns": result.get("num_turns"),
        "cost_usd": result.get("total_cost_usd"),
        "output_tokens": usage.get("output_tokens"),
    }


def install_fixture(workspace, fixture):
    """Copie evals/fixtures/<fixture> et l'initialise en dépôt git.

    Le dépôt est nécessaire : le fix du modèle doit apparaître comme une
    modification non commitée pour que verify-test-first.sh puisse rejouer
    l'état rouge. Sans ça, le skill ne peut pas être évalué sur son artefact.
    """
    source = os.path.join(REPO, "evals", "fixtures", fixture)
    if not os.path.isdir(source):
        raise FileNotFoundError(f"fixture introuvable : {source}")
    shutil.copytree(source, workspace, dirs_exist_ok=True)
    env = {**os.environ, "GIT_AUTHOR_NAME": "eval", "GIT_AUTHOR_EMAIL": "eval@local",
           "GIT_COMMITTER_NAME": "eval", "GIT_COMMITTER_EMAIL": "eval@local"}

    # Une fixture de régression a besoin d'un historique, pas d'un commit
    # unique : son setup.sh le construit. Il est déplacé HORS de l'arbre
    # avant exécution, sinon il se commiterait lui-même et laisserait le
    # dépôt sale une fois retiré.
    setup = os.path.join(workspace, "setup.sh")
    if os.path.isfile(setup):
        runner = os.path.join(tempfile.mkdtemp(), "setup.sh")
        shutil.move(setup, runner)
        subprocess.run(["bash", runner], cwd=workspace, env=env,
                       capture_output=True, check=True)
        return

    for argv in (["init", "-q"], ["add", "-A"], ["commit", "-qm", "fixture baseline"]):
        subprocess.run(["git", *argv], cwd=workspace, env=env,
                       capture_output=True, check=True)


def run_case(case, skill, with_skill, model, timeout, calibrate=False):
    workspace = tempfile.mkdtemp(prefix="skill-eval-")
    try:
        if with_skill:
            destination = os.path.join(workspace, ".claude", "skills", skill)
            shutil.copytree(os.path.join(REPO, "skills", skill), destination)

        fixture = case.get("fixture")
        if fixture:
            install_fixture(workspace, fixture)

        # Sans fixture, écrire est inutile et masquerait une fabrication :
        # le modèle ne doit pas pouvoir inventer un fichier qu'il prétend corriger.
        tools = "Skill,Read,Glob,Grep"
        if fixture:
            tools += ",Bash,Edit,Write"

        cmd = [
            "claude", "-p", case["prompt"],
            "--output-format", "stream-json", "--verbose",
            "--max-turns", str(case.get("max_turns", 8)),
            "--allowedTools", tools,
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
        metrics = collect_metrics(events)
        # Ce que le modèle a FAIT, pas ce qu'il en dit. Seule preuve disponible.
        diff_text = ""
        changed_lines = 0
        if fixture:
            diff = subprocess.run(["git", "diff", "--", ".", ":(exclude).claude"],
                                  cwd=workspace, capture_output=True, text=True)
            diff_text = diff.stdout
            changed_lines = sum(
                1 for line in diff_text.splitlines()
                if line[:1] in "+-" and not line.startswith(("+++", "---"))
            )
    except subprocess.TimeoutExpired:
        return {"passed": False, "reason": "timeout", "triggered": None, "metrics": {}}
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
    for pattern in case.get("diff_checks", []):
        if not re.search(pattern, diff_text):
            reasons.append(f"diff sans: /{pattern}/")
    for pattern in case.get("forbidden_diff_patterns", []):
        if re.search(pattern, diff_text):
            reasons.append(f"diff touche l'interdit: /{pattern}/")
    budget = case.get("max_tool_calls")
    if budget is not None and not calibrate and metrics["tool_calls"] > budget:
        reasons.append(f"budget outils dépassé: {metrics['tool_calls']} > {budget}")
    max_lines = case.get("max_changed_lines")
    if max_lines is not None and not calibrate and changed_lines > max_lines:
        reasons.append(f"fix non minimal: {changed_lines} lignes > {max_lines}")

    metrics["changed_lines"] = changed_lines
    return {"passed": not reasons, "reason": "; ".join(reasons),
            "triggered": triggered, "metrics": metrics}


def run(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("skill", help="nom du skill (fichier evals/<skill>.json)")
    parser.add_argument("--trials", type=int, default=3,
                        help="le résultat est non déterministe : 1 trial mesure surtout le bruit")
    parser.add_argument("--calibrate", action="store_true",
                        help="n'applique PAS max_tool_calls/max_changed_lines, rapporte les "
                             "valeurs observées — à lancer avant de fixer un seuil")
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
            run_case(case, args.skill, with_skill, args.model, args.timeout, args.calibrate)
            for _ in range(args.trials)
        ]
        passed = sum(1 for r in trial_results if r["passed"])
        total_pass += passed
        total_trials += args.trials
        status = "✅" if passed == args.trials else ("❌" if passed == 0 else "⚠️")
        calls = [t["metrics"].get("tool_calls") for t in trial_results if t.get("metrics")]
        costs = [t["metrics"].get("cost_usd") for t in trial_results if t.get("metrics")]
        calls = [c for c in calls if c is not None]
        costs = [c for c in costs if c is not None]
        cost_note = f"  outils={sum(calls)/len(calls):.0f}" if calls else ""
        if costs:
            cost_note += f"  ${sum(costs)/len(costs):.3f}"
        print(f"{status} {case['id']:32} {passed}/{args.trials}{cost_note}")
        if args.calibrate:
            lines = [t["metrics"].get("changed_lines") for t in trial_results if t.get("metrics")]
            lines = [v for v in lines if v]
            observed = f"outils max={max(calls)}" if calls else "aucune métrique"
            if lines:
                observed += f"  lignes max={max(lines)}"
            print(f"     ↳ observé : {observed}  → seuil suggéré = max + marge")
        for trial in trial_results:
            if not trial["passed"]:
                print(f"     ↳ {trial['reason']}")
        results.append({"id": case["id"], "passed": passed, "trials": args.trials,
                        "details": trial_results})

    rate = 100.0 * total_pass / total_trials if total_trials else 0.0
    all_costs = [t["metrics"].get("cost_usd") for r in results for t in r["details"]
                 if t.get("metrics") and t["metrics"].get("cost_usd") is not None]
    all_calls = [t["metrics"].get("tool_calls") for r in results for t in r["details"]
                 if t.get("metrics") and t["metrics"].get("tool_calls") is not None]
    print(f"\nScore : {total_pass}/{total_trials} trials ({rate:.0f}%)")
    if all_costs:
        print(f"Coût  : ${sum(all_costs):.2f} total, ${sum(all_costs)/len(all_costs):.3f}/trial"
              f", {sum(all_calls)/len(all_calls):.1f} appels d'outils/trial")

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
