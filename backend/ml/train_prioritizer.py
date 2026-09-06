"""
Train and calibrate the RailBlockAI maintainability-prioritization model.

Usage:
    python backend/ml/train_prioritizer.py [--data PATH]
"""

from __future__ import annotations

import argparse
import json
import os
import pickle
import sys
from pathlib import Path
from typing import Dict, List

import numpy as np

from prioritizer import PriorityModel, build_features, feature_vector

ROOT = Path(__file__).resolve().parent.parent.parent  # repo root
DEFAULT_DATA = ROOT / "data"


def load_tasks(data_dir: Path) -> List[dict]:
    with open(data_dir / "maintenance_tasks.json", encoding="utf-8") as f:
        return json.load(f)


def load_defects(data_dir: Path) -> Dict[str, dict]:
    with open(data_dir / "defects.json", encoding="utf-8") as f:
        defects = json.load(f)
    return {d.get("task_id"): d for d in defects}


def load_schedule(data_dir: Path) -> List[dict]:
    try:
        with open(data_dir / "train_schedule.json", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(DEFAULT_DATA))
    ap.add_argument("--out", default=str(ROOT / "backend" / "ml" / "prioritizer_model.pkl"))
    ap.add_argument("--augment", type=int, default=4)
    args = ap.parse_args()

    data_dir = Path(args.data)
    tasks = load_tasks(data_dir)
    defects_by_task = load_defects(data_dir)
    schedule = load_schedule(data_dir)

    print(f"Loaded {len(tasks)} tasks, {len(defects_by_task)} linked defects, "
          f"{len(schedule)} scheduled trains")

    model = PriorityModel(seed=42)
    metrics = model.train(tasks, defects_by_task, schedule, augment_factor=args.augment)

    print("\n=== Training / calibration report ===")
    for k, v in metrics.items():
        print(f"  {k}: {v}")

    if not model.trained:
        print("Model NOT trained — falling back to heuristic.", file=sys.stderr)
        sys.exit(1)

    feat = build_features(tasks[0], defects_by_task.get(tasks[0]["task_id"]), schedule)
    print("\nSample feature vector for", tasks[0]["task_id"])
    print("  ", {k: round(v, 3) for k, v in feat.items()})

    with open(args.out, "wb") as f:
        pickle.dump(model, f)
    print(f"\nSaved calibrated model -> {args.out}")


if __name__ == "__main__":
    main()