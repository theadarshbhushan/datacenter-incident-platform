"""
Portable, numpy-only scoring for the tree models the training pipeline exports.

Models are saved as plain JSON arrays rather than pickles: loading a pickle can execute code, and
pickles break across scikit-learn versions. Training checks that these functions reproduce
scikit-learn's own outputs on held-out data before an artifact is written (see app.ml.training).
"""
from __future__ import annotations

import math
from typing import Any, Dict, List

import numpy as np

EULER = 0.5772156649015329


def average_path_length(n: np.ndarray | float) -> np.ndarray:
    """Expected path length of an unsuccessful BST search, as in the Isolation Forest paper / scikit-learn."""
    n = np.asarray(n, dtype=float)
    out = np.zeros_like(n)
    out[n == 2] = 1.0
    big = n > 2
    out[big] = 2.0 * (np.log(n[big] - 1.0) + EULER) - 2.0 * (n[big] - 1.0) / n[big]
    return out


class Forest:
    """
    All trees of an ensemble packed into flat arrays and traversed together, one depth level per step,
    so scoring costs max_depth numpy operations instead of one Python loop per tree.
    """

    def __init__(self, trees: List[Dict[str, Any]]):
        offsets = np.cumsum([0] + [len(t["feature"]) for t in trees[:-1]])
        cat = lambda key, dtype: np.concatenate([np.asarray(t[key], dtype=dtype) for t in trees])  # noqa: E731
        left, right = cat("left", np.int64), cat("right", np.int64)
        shift = np.concatenate([np.full(len(t["feature"]), o) for t, o in zip(trees, offsets)])
        self.leaf = left == -1
        self.left = np.where(self.leaf, -1, left + shift)
        self.right = np.where(self.leaf, -1, right + shift)
        self.feature = np.where(self.leaf, 0, cat("feature", np.int64))
        self.threshold = cat("threshold", np.float64)
        self.value = cat("value", np.float64)
        self.roots = offsets.astype(np.int64)
        self.depth = max(int(t["max_depth"]) for t in trees) if trees else 0
        self.n_trees = len(trees)

    def leaf_values(self, X: np.ndarray) -> np.ndarray:
        """(n_rows, n_trees) output of the leaf each row reaches in each tree."""
        # scikit-learn compares float32 features against float64 thresholds.
        X32 = np.asarray(X, dtype=np.float32).astype(np.float64)
        node = np.broadcast_to(self.roots, (len(X32), self.n_trees)).copy()
        rows = np.arange(len(X32))[:, None]
        for _ in range(self.depth + 1):
            internal = ~self.leaf[node]
            if not internal.any():
                break
            go_left = X32[rows, self.feature[node]] <= self.threshold[node]
            node = np.where(internal, np.where(go_left, self.left[node], self.right[node]), node)
        return self.value[node]


def export_sklearn_tree(tree_, leaf_value: np.ndarray) -> Dict[str, Any]:
    """Serialize a fitted sklearn `tree_` with a per-node output value."""
    depth = _node_depths(tree_)
    return {
        "feature": tree_.feature.tolist(),
        "threshold": [float(t) for t in tree_.threshold],
        "left": tree_.children_left.tolist(),
        "right": tree_.children_right.tolist(),
        "value": [float(v) for v in leaf_value],
        "max_depth": int(depth.max()),
    }


def _node_depths(tree_) -> np.ndarray:
    depth = np.zeros(tree_.node_count, dtype=np.int64)
    stack = [0]
    while stack:
        i = stack.pop()
        for c in (tree_.children_left[i], tree_.children_right[i]):
            if c != -1:
                depth[c] = depth[i] + 1
                stack.append(c)
    return depth


# ---------- Isolation Forest ----------

def export_isolation_forest(model) -> Dict[str, Any]:
    trees: List[Dict[str, Any]] = []
    for est in model.estimators_:
        t = est.tree_
        # Path length contributed by ending in each node: its depth plus the expected remaining depth
        # of the samples that were not split further.
        leaf_value = _node_depths(t) + average_path_length(t.n_node_samples)
        trees.append(export_sklearn_tree(t, leaf_value))
    return {"type": "isolation_forest", "max_samples": int(model.max_samples_), "trees": trees}


class IsolationForestScorer:
    def __init__(self, d: Dict[str, Any]):
        self.forest = Forest(d["trees"])
        self.norm = float(average_path_length(np.array([d["max_samples"]]))[0])

    def score_samples(self, X: np.ndarray) -> np.ndarray:
        """Same convention as sklearn's IsolationForest.score_samples: lower is more anomalous, in [-1, 0)."""
        depth = self.forest.leaf_values(X).sum(axis=1)
        return -np.power(2.0, -depth / (self.forest.n_trees * self.norm))


# ---------- probabilistic classifiers ----------

def export_random_forest(model) -> Dict[str, Any]:
    trees = []
    for est in model.estimators_:
        v = est.tree_.value[:, 0, :]
        trees.append(export_sklearn_tree(est.tree_, v[:, 1] / np.maximum(v.sum(axis=1), 1e-12)))
    return {"type": "random_forest", "trees": trees}


def export_gradient_boosting(model) -> Dict[str, Any]:
    prior = float(model.init_.class_prior_[1])
    return {
        "type": "gradient_boosting",
        "init_raw": math.log(prior / (1 - prior)),
        "learning_rate": float(model.learning_rate),
        "trees": [export_sklearn_tree(est[0].tree_, est[0].tree_.value[:, 0, 0]) for est in model.estimators_],
    }


def export_logistic(model, scaler) -> Dict[str, Any]:
    return {
        "type": "logistic_regression",
        "mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist(),
        "coef": model.coef_[0].tolist(), "intercept": float(model.intercept_[0]),
    }


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


class ClassifierScorer:
    """Positive-class score of an exported classifier, optionally passed through isotonic calibration."""

    def __init__(self, d: Dict[str, Any], calibration: Dict[str, Any] | None = None):
        self.kind = d["type"]
        self.d = d
        self.forest = Forest(d["trees"]) if d.get("trees") else None
        self.calibration = calibration

    def raw(self, X: np.ndarray) -> np.ndarray:
        if self.kind == "logistic_regression":
            z = (X - np.asarray(self.d["mean"])) / np.asarray(self.d["scale"])
            return _sigmoid(z @ np.asarray(self.d["coef"]) + self.d["intercept"])
        if self.kind == "random_forest":
            return self.forest.leaf_values(X).mean(axis=1)
        if self.kind == "gradient_boosting":
            return _sigmoid(self.d["init_raw"] + self.d["learning_rate"] * self.forest.leaf_values(X).sum(axis=1))
        raise ValueError(f"unknown classifier type {self.kind}")

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        p = self.raw(X)
        if self.calibration:
            p = np.interp(p, self.calibration["x"], self.calibration["y"])
        return p
