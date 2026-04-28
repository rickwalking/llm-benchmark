SHELL := /bin/bash
HARNESS_DIR := $(shell pwd)
REPO_ROOT := $(abspath $(HARNESS_DIR)/..)
PYTHON ?= python3
DOCKER_IMAGE ?= llm-bench-runner:dev

# Usage: make eval RUN=runs/opus-4.7-seed1
RUN ?=
GEN ?=
SEED ?= 1

.PHONY: help generate eval objective evidence judge score leaderboard article-data check clean docker-build _docker_image_exists

help:
	@echo "Targets:"
	@echo "  make docker-build                   build the sandbox container image ($(DOCKER_IMAGE))"
	@echo "  make generate  GEN=<name> SEED=<n>  run a CLI generator → runs/<gen>-seed<n>/candidate/"
	@echo "  make objective RUN=<path>           run the objective gauntlet inside the container"
	@echo "  make evidence  RUN=<path>           package per-criterion evidence"
	@echo "  make judge     RUN=<path>           run Claude Code judge (host); boots candidate in container"
	@echo "  make score     RUN=<path>           aggregate this run's score"
	@echo "  make eval      RUN=<path>           objective → evidence → judge → score"
	@echo "  make leaderboard MODEL=<name>       aggregate seeds for one model"
	@echo "  make article-data                   aggregate all models → article tables"
	@echo "  make check                          validate fixture and rubrics are well-formed"
	@echo "  make clean                          remove generated runs/"

docker-build:
	@docker build -t $(DOCKER_IMAGE) $(HARNESS_DIR)

_docker_image_exists:
	@docker image inspect $(DOCKER_IMAGE) >/dev/null 2>&1 || $(MAKE) docker-build

generate:
	@if [ -z "$(GEN)" ]; then echo "ERROR: GEN=<generator-name> required (see candidate_generators in config.yaml)"; exit 2; fi
	@bash scripts/generate.sh "$(GEN)" "$(GEN)-seed$(SEED)" "$(HARNESS_DIR)"

_require_run:
	@if [ -z "$(RUN)" ]; then echo "ERROR: RUN=<path> required"; exit 2; fi
	@if [ ! -d "$(RUN)/candidate" ]; then echo "ERROR: $(RUN)/candidate not found"; exit 2; fi

eval: objective evidence judge score

objective: _require_run _docker_image_exists
	@mkdir -p $${HOME}/.npm-docker
	@bash scripts/docker-run.sh gauntlet "$(notdir $(RUN))" "$(HARNESS_DIR)" "$(DOCKER_IMAGE)"

evidence: _require_run
	@$(PYTHON) scripts/package_evidence.py --run "$(RUN)" --repo-root "$(REPO_ROOT)"

judge: _require_run
	@$(PYTHON) scripts/judge.py --run "$(RUN)" --config "$(HARNESS_DIR)/config.yaml" --repo-root "$(REPO_ROOT)"

score: _require_run
	@$(PYTHON) scripts/score.py --run "$(RUN)" --config "$(HARNESS_DIR)/config.yaml"

leaderboard:
	@if [ -z "$(MODEL)" ]; then echo "ERROR: MODEL=<name> required"; exit 2; fi
	@$(PYTHON) scripts/score.py --leaderboard --model "$(MODEL)" --config "$(HARNESS_DIR)/config.yaml"

article-data:
	@$(PYTHON) scripts/score.py --article --config "$(HARNESS_DIR)/config.yaml"

check:
	@$(PYTHON) scripts/score.py --check --repo-root "$(REPO_ROOT)" --config "$(HARNESS_DIR)/config.yaml"

clean:
	@rm -rf runs/
	@echo "removed runs/"
